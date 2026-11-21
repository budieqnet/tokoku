import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(1).max(150),
  sku: z.string().max(50).optional(),
  buy_price: z.number().min(0).default(0),
  price: z.number().min(0).default(0),
  partner_price: z.number().min(0).default(0),
  bundle_qty: z.number().int().min(0).default(0),
  bundle_price: z.number().min(0).default(0),
  stock: z.number().int().default(0),
  supplier_id: z.number().int().positive().optional(),
  supplier_name: z.string().max(100).optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { id } = await params;

  const product = await queryOne(
    `SELECT p.*, s.name as supplier_name 
     FROM products p 
     LEFT JOIN suppliers s ON p.supplier_id = s.id 
     WHERE p.id = ? AND p.user_id = ?`,
    [id, user.userId]
  );

  if (!product) {
    return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json(product);
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
    const parsed = productSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, sku, buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id, supplier_name, purchase_date } = parsed.data;

    const existing = await queryOne('SELECT id FROM products WHERE id = ? AND user_id = ?', [id, user.userId]);
    if (!existing) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    if (sku) {
      const existingSku = await queryOne('SELECT id FROM products WHERE user_id = ? AND sku = ? AND id != ?', [user.userId, sku, id]);
      if (existingSku) {
        return NextResponse.json({ error: 'SKU sudah digunakan' }, { status: 409 });
      }
    }

    await execute(
      `UPDATE products SET name = ?, sku = ?, buy_price = ?, price = ?, partner_price = ?, bundle_qty = ?, bundle_price = ?, stock = ?, supplier_id = ?, supplier_name = ?, purchase_date = ? WHERE id = ? AND user_id = ?`,
      [name, sku || null, buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id || null, supplier_name || null, purchase_date || null, id, user.userId]
    );

    const product = await queryOne(
      `SELECT p.*, s.name as supplier_name 
       FROM products p 
       LEFT JOIN suppliers s ON p.supplier_id = s.id 
       WHERE p.id = ?`,
      [id]
    );
    return NextResponse.json(product);
  } catch (error) {
    console.error('Update product error:', error);
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

  const existing = await queryOne('SELECT id FROM products WHERE id = ? AND user_id = ?', [id, user.userId]);
  if (!existing) {
    return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  }

  await execute('DELETE FROM products WHERE id = ? AND user_id = ?', [id, user.userId]);
  return NextResponse.json({ message: 'Produk dihapus' });
}