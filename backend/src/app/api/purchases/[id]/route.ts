import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, transaction } from '@/lib/db';
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
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { id } = await params;

  const purchase = await queryOne(
    'SELECT * FROM purchases WHERE id = ? AND user_id = ?',
    [id, user.userId]
  );

  if (!purchase) {
    return NextResponse.json({ error: 'Pembelian tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json(purchase);
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
    const parsed = purchaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { product_id, product_name, sku, qty, price, supplier_id, supplier_name, customer_id, customer_name, purchase_date, notes } = parsed.data;

    const purchase = await transaction(async (conn) => {
      // Get existing purchase data
      const [existingRows] = await conn.execute(
        'SELECT product_id, qty FROM purchases WHERE id = ? AND user_id = ?',
        [id, user.userId]
      );
      const existing = (existingRows as any[])[0];
      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      const oldProductId = existing.product_id;
      const oldQty = existing.qty;
      const newProductId = product_id || null;
      const newQty = qty;

      // Update purchase record
      await conn.execute(
        `UPDATE purchases SET product_id = ?, product_name = ?, sku = ?, qty = ?, price = ?, supplier_id = ?, supplier_name = ?, customer_id = ?, customer_name = ?, purchase_date = ?, notes = ? WHERE id = ? AND user_id = ?`,
        [newProductId, product_name, sku || null, newQty, price, supplier_id || null, supplier_name || null, customer_id || null, customer_name || null, purchase_date, notes || null, id, user.userId]
      );

      // Adjust product stock
      if (oldProductId && newProductId && oldProductId === newProductId) {
        // Same product: adjust by difference
        const diff = newQty - oldQty;
        if (diff !== 0) {
          await conn.execute(
            'UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?',
            [diff, oldProductId, user.userId]
          );
        }
      } else {
        // Product changed or removed: revert old, apply new
        if (oldProductId) {
          await conn.execute(
            'UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?',
            [oldQty, oldProductId, user.userId]
          );
        }
        if (newProductId) {
          await conn.execute(
            'UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?',
            [newQty, newProductId, user.userId]
          );
        }
      }

      const [rows] = await conn.execute('SELECT * FROM purchases WHERE id = ?', [id]);
      return (rows as any[])[0];
    });

    return NextResponse.json(purchase);
  } catch (error) {
    if ((error as Error).message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Pembelian tidak ditemukan' }, { status: 404 });
    }
    console.error('Update purchase error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { id } = await params;

  const purchase = await transaction(async (conn) => {
    const [existingRows] = await conn.execute(
      'SELECT product_id, qty FROM purchases WHERE id = ? AND user_id = ?',
      [id, user.userId]
    );
    const existing = (existingRows as any[])[0];
    if (!existing) {
      throw new Error('NOT_FOUND');
    }

    const productId = existing.product_id;
    const qty = existing.qty;

    // Delete purchase record
    await conn.execute('DELETE FROM purchases WHERE id = ? AND user_id = ?', [id, user.userId]);

    // Revert product stock
    if (productId) {
      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?',
        [qty, productId, user.userId]
      );
    }

    return { message: 'Pembelian dihapus' };
  });

  return NextResponse.json(purchase);
}