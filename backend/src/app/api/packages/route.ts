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
    whereClause += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  const total = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM packages ${whereClause}`,
    params
  );

  const packages = await query<any>(
    `SELECT * FROM packages ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Get items for each package
  for (const pkg of packages) {
    const items = await query<any>(
      `SELECT pi.*, p.name as product_name, p.sku, p.price as product_price, p.stock
       FROM package_items pi
       JOIN products p ON pi.product_id = p.id
       WHERE pi.package_id = ?`,
      [pkg.id]
    );
    pkg.items = items;
  }

  return NextResponse.json({
    data: packages,
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
    const parsed = packageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, price, items } = parsed.data;

    // Verify all products belong to user
    const productIds = items.map(i => i.product_id);
    const placeholders = productIds.map(() => '?').join(',');
    const products = await query<any>(
      `SELECT id FROM products WHERE user_id = ? AND id IN (${placeholders})`,
      [user.userId, ...productIds]
    );

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: 'Satu atau lebih produk tidak ditemukan' }, { status: 400 });
    }

    const result = await transaction(async (conn) => {
      const [pkgResult] = await conn.execute(
        `INSERT INTO packages (user_id, name, price) VALUES (?, ?, ?)`,
        [user.userId, name, price]
      );
      const pkgId = (pkgResult as any).insertId;

      for (const item of items) {
        await conn.execute(
          `INSERT INTO package_items (package_id, product_id, qty) VALUES (?, ?, ?)`,
          [pkgId, item.product_id, item.qty]
        );
      }

      return pkgId;
    });

    const pkg = await queryOne<PackageWithItems>('SELECT * FROM packages WHERE id = ?', [result]);
    const pkgItems = await query(
      `SELECT pi.*, p.name as product_name, p.sku, p.price as product_price, p.stock
       FROM package_items pi
       JOIN products p ON pi.product_id = p.id
       WHERE pi.package_id = ?`,
      [result]
    ) as Array<{
      id: number
      package_id: number
      product_id: number
      qty: number
      created_at: string
      product_name?: string
      sku?: string
      product_price?: number
      stock?: number
    }>;
    if (pkg) {
      pkg.items = pkgItems ?? [];
    }

    return NextResponse.json(pkg, { status: 201 });
  } catch (error) {
    console.error('Create package error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}