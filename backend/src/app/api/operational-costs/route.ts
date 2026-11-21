import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

const costSchema = z.object({
  category_id: z.number().int().positive().optional(),
  category_name: z.string().min(1).max(100),
  amount: z.number().positive('Jumlah harus lebih dari 0'),
  cost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  notes: z.string().optional(),
  receipt_url: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [user.userId];

    if (search) {
      whereClause += ' AND (category_name LIKE ? OR notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const rows = await query(
      `SELECT oc.*, ec.name AS category_master_name
       FROM operational_costs oc
       LEFT JOIN expense_categories ec ON oc.category_id = ec.id
       ${whereClause}
       ORDER BY oc.cost_date DESC, oc.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const countRows = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM operational_costs oc ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Operational costs GET error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const body = await request.json();
    const parsed = costSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { category_id, category_name, amount, cost_date, notes, receipt_url } = parsed.data;

    const { insertId } = await execute(
      `INSERT INTO operational_costs (user_id, category_id, category_name, amount, cost_date, notes, receipt_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.userId, category_id ?? null, category_name, amount, cost_date, notes ?? null, receipt_url ?? null]
    );

    const row = await queryOne(
      `SELECT oc.*, ec.name AS category_master_name
       FROM operational_costs oc
       LEFT JOIN expense_categories ec ON oc.category_id = ec.id
       WHERE oc.id = ?`,
      [insertId]
    );

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    console.error('Operational costs POST error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
