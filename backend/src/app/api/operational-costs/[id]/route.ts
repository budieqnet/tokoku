import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

const costSchema = z.object({
  category_id: z.number().int().positive().optional(),
  category_name: z.string().min(1).max(100).optional(),
  amount: z.number().positive('Jumlah harus lebih dari 0').optional(),
  cost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional(),
  notes: z.string().optional(),
  receipt_url: z.string().max(500).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Tidak ada data yang diubah',
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const row = await queryOne(
      `SELECT oc.*, ec.name AS category_master_name
       FROM operational_costs oc
       LEFT JOIN expense_categories ec ON oc.category_id = ec.id
       WHERE oc.id = ? AND oc.user_id = ?`,
      [id, user.userId]
    );
    if (!row) return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return NextResponse.json({ data: row });
  } catch (error) {
    console.error('Operational costs GET one error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const body = await request.json();
    const parsed = costSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const fields = Object.keys(parsed.data) as (keyof z.infer<typeof costSchema>)[];
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => parsed.data[f]);

    const existing = await queryOne('SELECT id FROM operational_costs WHERE id = ? AND user_id = ?', [id, user.userId]);
    if (!existing) return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });

    await execute(`UPDATE operational_costs SET ${setClause} WHERE id = ?`, [...values, id]);

    const row = await queryOne(
      `SELECT oc.*, ec.name AS category_master_name
       FROM operational_costs oc
       LEFT JOIN expense_categories ec ON oc.category_id = ec.id
       WHERE oc.id = ?`,
      [id]
    );
    return NextResponse.json({ data: row });
  } catch (error) {
    console.error('Operational costs PUT error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const existing = await queryOne('SELECT id FROM operational_costs WHERE id = ? AND user_id = ?', [id, user.userId]);
    if (!existing) return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });

    await execute('DELETE FROM operational_costs WHERE id = ?', [id]);
    return NextResponse.json({ message: 'Biaya operasional berhasil dihapus' });
  } catch (error) {
    console.error('Operational costs DELETE error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
