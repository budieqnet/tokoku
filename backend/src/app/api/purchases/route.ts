import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute, transaction } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

const purchaseSchema = z.object({
  product_id: z.number().int().positive().optional(),
  product_name: z.string().min(1).max(150),
  sku: z.string().max(50).optional(),
  qty: z.number().int().positive(),
  price: z.number().min(0),
  supplier_id: z.number().int().positive().optional(),
  supplier_name: z.string().max(100).optional(),
  customer_id: z.number().int().positive().optional(),
  customer_name: z.string().max(100).optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  payment_method: z.enum(['cash', 'transfer', 'partner_savings']).default('cash'),
  partner_id: z.number().int().positive().optional(),
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
    whereClause += ' AND (product_name LIKE ? OR supplier_name LIKE ? OR sku LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const total = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM purchases ${whereClause}`,
    params
  );

  const purchases = await query<any>(
    `SELECT * FROM purchases ${whereClause} ORDER BY purchase_date DESC, created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return NextResponse.json({
    data: purchases,
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
    const parsed = purchaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { product_id, product_name, sku, qty, price, supplier_id, supplier_name, customer_id, customer_name, purchase_date, notes, payment_method, partner_id } = parsed.data;

    const subtotal = qty * price;

    // Validate partner savings balance if using partner_savings payment method
    if (payment_method === 'partner_savings') {
      if (!partner_id) {
        return NextResponse.json(
          { error: 'Validasi gagal', details: { partner_id: ['Mitra harus dipilih untuk pembayaran via tabungan'] } },
          { status: 400 }
        );
      }
      const savings = await queryOne<{ balance: number }>(
        'SELECT balance FROM partner_savings WHERE partner_id = ? AND user_id = ?',
        [partner_id, user.userId]
      );
      if (!savings || Number(savings.balance) < subtotal) {
        return NextResponse.json(
          { error: 'Validasi gagal', details: { payment_method: ['Saldo tabungan mitra tidak mencukupi'] } },
          { status: 400 }
        );
      }
    }

    const purchase = await transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO purchases (user_id, product_id, product_name, sku, qty, price, supplier_id, supplier_name, customer_id, customer_name, purchase_date, notes, payment_method, partner_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.userId, product_id || null, product_name, sku || null, qty, price, supplier_id || null, supplier_name || null, customer_id || null, customer_name || null, purchase_date, notes || null, payment_method, partner_id || null]
      );

      const insertId = (result as any).insertId;

      // Update product stock if product_id is provided
      if (product_id) {
        await conn.execute(
          'UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?',
          [qty, product_id, user.userId]
        );
      }

      // Deduct from partner savings if using partner_savings payment method
      if (payment_method === 'partner_savings' && partner_id) {
        const [savingsResult] = await conn.execute(
          'SELECT id, balance FROM partner_savings WHERE partner_id = ? AND user_id = ? FOR UPDATE',
          [partner_id, user.userId]
        );
        const savings = (savingsResult as any[])[0];
        if (savings) {
          const balanceBefore = Number(savings.balance);
          const balanceAfter = balanceBefore - subtotal;
          
          await conn.execute(
            'UPDATE partner_savings SET balance = ? WHERE id = ?',
            [balanceAfter, savings.id]
          );

          // Record transaction
          await conn.execute(
            `INSERT INTO partner_savings_transactions 
             (user_id, partner_id, type, amount, balance_before, balance_after, reference_type, reference_id, notes) 
             VALUES (?, ?, 'payment', ?, ?, ?, 'purchase', ?, ?)`,
            [user.userId, partner_id, subtotal, balanceBefore, balanceAfter, insertId, `Pembayaran pembelian #${insertId}`]
          );
        }
      }

      const [rows] = await conn.execute('SELECT * FROM purchases WHERE id = ?', [insertId]);
      return (rows as any[])[0];
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    console.error('Create purchase error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}