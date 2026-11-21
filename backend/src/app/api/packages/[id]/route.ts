import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute, transaction } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

interface PackageWithItems {
  id: number
  user_id: number
  name: string
  price: number
  created_at: string
  updated_at: string
  items?: Array<{
    id: number
    package_id: number
    product_id: number
    qty: number
    created_at: string
    product_name?: string
    sku?: string
    product_price?: number
    stock?: number
  }>
}

const packageSchema = z.object({
  name: z.string().min(1).max(150),
  price: z.number().min(0),
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    qty: z.number().int().positive(),
  })).min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { id } = await params;

  const pkg = await queryOne<PackageWithItems>(
    'SELECT * FROM packages WHERE id = ? AND user_id = ?',
    [id, user.userId]
  );

  if (!pkg) {
    return NextResponse.json({ error: 'Paket tidak ditemukan' }, { status: 404 });
  }

  const items = await query<any>(
    `SELECT pi.*, p.name as product_name, p.sku, p.price as product_price, p.stock
     FROM package_items pi
     JOIN products p ON pi.product_id = p.id
     WHERE pi.package_id = ?`,
    [id]
  );
  pkg.items = items ?? [];

  return NextResponse.json(pkg);
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
    const parsed = packageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, price, items } = parsed.data;

    const existing = await queryOne('SELECT id FROM packages WHERE id = ? AND user_id = ?', [id, user.userId]);
    if (!existing) {
      return NextResponse.json({ error: 'Paket tidak ditemukan' }, { status: 404 });
    }

    // Verify all products belong to user
    const productIds = items.map(i => i.product_id);
    const placeholders = productIds.map(() => '?').join(',');
    const products = await query<any>(
      `SELECT id FROM products WHERE user_id = ? AND id IN (${placeholders})`,
      [user.userId, ...productIds]
    );

    if (!products || products.length !== productIds.length) {
      return NextResponse.json({ error: 'Satu atau lebih produk tidak ditemukan' }, { status: 400 });
    }

    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE packages SET name = ?, price = ? WHERE id = ? AND user_id = ?`,
        [name, price, id, user.userId]
      );

      await conn.execute('DELETE FROM package_items WHERE package_id = ?', [id]);

      for (const item of items) {
        await conn.execute(
          `INSERT INTO package_items (package_id, product_id, qty) VALUES (?, ?, ?)`,
          [id, item.product_id, item.qty]
        );
      }
    });

    const pkg = await queryOne<PackageWithItems>('SELECT * FROM packages WHERE id = ?', [id]);
    const items2 = await queryOne<any[]>(
      `SELECT pi.*, p.name as product_name, p.sku, p.price as product_price, p.stock
       FROM package_items pi
       JOIN products p ON pi.product_id = p.id
       WHERE pi.package_id = ?`,
      [id]
    );
    if (pkg) {
      pkg.items = items2 ?? [];
    }

    return NextResponse.json(pkg);
  } catch (error) {
    console.error('Update package error:', error);
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

  const existing = await queryOne('SELECT id FROM packages WHERE id = ? AND user_id = ?', [id, user.userId]);
  if (!existing) {
    return NextResponse.json({ error: 'Paket tidak ditemukan' }, { status: 404 });
  }

  await transaction(async (conn) => {
    await conn.execute('DELETE FROM package_items WHERE package_id = ?', [id]);
    await conn.execute('DELETE FROM packages WHERE id = ? AND user_id = ?', [id, user.userId]);
  });

  return NextResponse.json({ message: 'Paket dihapus' });
}