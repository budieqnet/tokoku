import { NextRequest, NextResponse } from 'next/server';
import { queryOne, transaction } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { applyStockDelta, getPackageStockData, getSaleStockItems, replaceSaleItems, SaleValidationError, SaleStockItem } from '@/lib/sale-items';
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
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { id } = await params;

  const sale = await queryOne(
    'SELECT * FROM sales WHERE id = ? AND user_id = ?',
    [id, user.userId]
  );

  if (!sale) {
    return NextResponse.json({ error: 'Penjualan tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json(sale);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const body = await request.json();
    const parsed = saleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { product_id, package_id, product_name, sku, qty, price, subtotal, customer_id, customer_name, customer_type, partner_id, sale_date, notes } = parsed.data;

    const sale = await transaction(async (conn) => {
      const [existingRows] = await conn.execute(
        'SELECT * FROM sales WHERE id = ? AND user_id = ? FOR UPDATE',
        [id, user.userId]
      );
      const existing = (existingRows as any[])[0];
      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      // Restore stock reserved by the current sale before validating the new one.
      const oldItems = await getSaleStockItems(conn, existing);
      await applyStockDelta(conn, user.userId, oldItems, 1);

      let newItems: SaleStockItem[] = [];
      let newProductId: number | null = product_id || null;
      let newPackageId: number | null = null;
      let newProductName = product_name;
      let newSku: string | null = sku || null;
      let newPrice = price;
      let newSubtotal = subtotal;

      if (package_id) {
        const pkg = await getPackageStockData(conn, package_id, user.userId, qty);
        newItems = pkg.items;
        newPackageId = pkg.id;
        newProductId = null;
        newProductName = pkg.name;
        newSku = null;
        newPrice = pkg.price;
        newSubtotal = pkg.price * qty;
      } else if (product_id) {
        newItems = [{ product_id, product_name, qty }];
      }

      // Apply the new stock reservation (validates availability).
      await applyStockDelta(conn, user.userId, newItems, -1);

      await conn.execute(
        `UPDATE sales SET product_id = ?, package_id = ?, product_name = ?, sku = ?, qty = ?, price = ?, subtotal = ?, customer_id = ?, customer_name = ?, customer_type = ?, partner_id = ?, sale_date = ?, notes = ? WHERE id = ? AND user_id = ?`,
        [newProductId, newPackageId, newProductName, newSku, qty, newPrice, newSubtotal, customer_id || null, customer_name || null, customer_type, partner_id || null, sale_date, notes || null, id, user.userId]
      );

      await replaceSaleItems(conn, Number(id), newItems);

      const [rows] = await conn.execute('SELECT * FROM sales WHERE id = ?', [id]);
      return (rows as any[])[0];
    });

    return NextResponse.json(sale);
  } catch (error) {
    if (error instanceof SaleValidationError) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: { [error.field]: [error.message] } },
        { status: 400 }
      );
    }
    if ((error as Error).message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Penjualan tidak ditemukan' }, { status: 404 });
    }
    console.error('Update sale error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;

    const result = await transaction(async (conn) => {
      const [existingRows] = await conn.execute(
        'SELECT * FROM sales WHERE id = ? AND user_id = ? FOR UPDATE',
        [id, user.userId]
      );
      const existing = (existingRows as any[])[0];
      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      // Restore every product reserved by this sale (package or product).
      const items = await getSaleStockItems(conn, existing);
      await applyStockDelta(conn, user.userId, items, 1);

      await conn.execute('DELETE FROM sale_items WHERE sale_id = ?', [id]);
      await conn.execute('DELETE FROM sales WHERE id = ? AND user_id = ?', [id, user.userId]);

      return { message: 'Penjualan dihapus' };
    });

    return NextResponse.json(result);
  } catch (error) {
    if ((error as Error).message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Penjualan tidak ditemukan' }, { status: 404 });
    }
    console.error('Delete sale error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}