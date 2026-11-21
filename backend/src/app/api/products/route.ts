import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute, transaction } from '@/lib/db';
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

export async function GET(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE p.user_id = ?';
  const params: any[] = [user.userId];

  if (search) {
    whereClause += ' AND (p.name LIKE ? OR p.sku LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM products p ${whereClause}`,
    params
  );

  const products = await query<any>(
    `SELECT p.*, s.name as supplier_name 
     FROM products p 
     LEFT JOIN suppliers s ON p.supplier_id = s.id 
     ${whereClause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return NextResponse.json({
    data: products,
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
    const parsed = productSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, sku, buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id, supplier_name, purchase_date } = parsed.data;

    if (sku) {
      const existingSku = await queryOne('SELECT id FROM products WHERE user_id = ? AND sku = ?', [user.userId, sku]);
      if (existingSku) {
        return NextResponse.json({ error: 'SKU sudah digunakan' }, { status: 409 });
      }
    }

    const result = await execute(
      `INSERT INTO products (user_id, name, sku, buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id, supplier_name, purchase_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.userId, name, sku || null, buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id || null, supplier_name || null, purchase_date || null]
    );

    const product = await queryOne(
      `SELECT p.*, s.name as supplier_name 
       FROM products p 
       LEFT JOIN suppliers s ON p.supplier_id = s.id 
       WHERE p.id = ?`,
      [result.insertId]
    );
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Create product error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}