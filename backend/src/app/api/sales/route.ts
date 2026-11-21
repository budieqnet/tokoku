import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, transaction } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { applyStockDelta, getPackageStockData, replaceSaleItems, SaleValidationError, SaleStockItem } from '@/lib/sale-items';
import { z } from 'zod';

const saleSchema = z.object({
  product_id: z.number().int().positive().optional(),
  package_id: z.number().int().positive().optional(),
  product_name: z.string().min(1).max(150),
  sku: z.string().max(50).optional(),
  qty: z.number().int().positive(),
  price: z.number().min(0),
  subtotal: z.number().min(0),
  customer_id: z.number().int().positive().optional(),
  customer_name: z.string().max(100).optional(),
  customer_type: z.enum(['pelanggan', 'mitra', 'umum']).default('umum'),
  partner_id: z.number().int().positive().optional(),
  sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  payment_method: z.enum(['cash', 'transfer', 'partner_savings']).default('cash'),
});

export async function GET(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE user_id = ?';
  const params: any[] = [user.userId];

  if (search) {
    whereClause += ' AND (product_name LIKE ? OR customer_name LIKE ? OR sku LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const total = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM sales ${whereClause}`,
    params
  );

  const sales = await query<any>(
    `SELECT * FROM sales ${whereClause} ORDER BY sale_date DESC, created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return NextResponse.json({
    data: sales,
    pagination: {
      page,
      limit,
      total: total?.count || 0,
      totalPages: Math.ceil((total?.count || 0) / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const body = await request.json();
    const parsed = saleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { product_id, package_id, product_name, sku, qty, price, subtotal, customer_id, customer_name, customer_type, partner_id, sale_date, notes, payment_method } = parsed.data;

    const sale = await transaction(async (conn) => {
      let stockItems: SaleStockItem[] = [];
      let finalProductId: number | null = product_id || null;
      let finalPackageId: number | null = null;
      let finalProductName = product_name;
      let finalSku: string | null = sku || null;
      let finalPrice = price;
      let finalSubtotal = subtotal;

      if (package_id) {
        // Package sale: stock is based on the package composition.
        const pkg = await getPackageStockData(conn, package_id, user.userId, qty);
        stockItems = pkg.items;
        finalPackageId = pkg.id;
        finalProductId = null;
        finalProductName = pkg.name;
        finalSku = null;
        finalPrice = pkg.price;
        finalSubtotal = pkg.price * qty;
      } else if (product_id) {
        // Direct product sale.
        stockItems = [{ product_id, product_name, qty }];
      }

      // Validate and lock partner savings balance before touching stock.
      let savings: { id: number; balance: number } | null = null;
      if (payment_method === 'partner_savings') {
        if (!partner_id) {
          throw new SaleValidationError('partner_id', 'Mitra harus dipilih untuk pembayaran via tabungan');
        }
        const [savingsRows] = await conn.execute(
          'SELECT id, balance FROM partner_savings WHERE partner_id = ? AND user_id = ? FOR UPDATE',
          [partner_id, user.userId]
        );
        const row = (savingsRows as Array<{ id: number; balance: number | string }>)[0];
        if (!row || Number(row.balance) < finalSubtotal) {
          throw new SaleValidationError('payment_method', 'Saldo tabungan mitra tidak mencukupi');
        }
        savings = { id: row.id, balance: Number(row.balance) };
      }

      // Deduct stock (locks products and validates availability).
      await applyStockDelta(conn, user.userId, stockItems, -1);

      const insertResult = await conn.execute(
        `INSERT INTO sales (user_id, product_id, package_id, product_name, sku, qty, price, subtotal, customer_id, customer_name, customer_type, partner_id, sale_date, notes, payment_method) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.userId, finalProductId, finalPackageId, finalProductName, finalSku, qty, finalPrice, finalSubtotal, customer_id || null, customer_name || null, customer_type, partner_id || null, sale_date, notes || null, payment_method]
      );
      const insertId = (insertResult[0] as any).insertId;

      await replaceSaleItems(conn, insertId, stockItems);

      // Deduct from partner savings if using partner_savings payment method
      if (payment_method === 'partner_savings' && partner_id && savings) {
        const balanceBefore = savings.balance;
        const balanceAfter = balanceBefore - finalSubtotal;

        await conn.execute(
          'UPDATE partner_savings SET balance = ? WHERE id = ?',
          [balanceAfter, savings.id]
        );

        // Record transaction
        await conn.execute(
          `INSERT INTO partner_savings_transactions 
           (user_id, partner_id, type, amount, balance_before, balance_after, reference_type, reference_id, notes) 
           VALUES (?, ?, 'payment', ?, ?, ?, 'sale', ?, ?)`,
          [user.userId, partner_id, finalSubtotal, balanceBefore, balanceAfter, insertId, `Pembayaran penjualan #${insertId}`]
        );
      }

      const selectResult = await conn.execute('SELECT * FROM sales WHERE id = ?', [insertId]);
      return (selectResult[0] as any[])[0];
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof SaleValidationError) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: { [error.field]: [error.message] } },
        { status: 400 }
      );
    }
    console.error('Create sale error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}