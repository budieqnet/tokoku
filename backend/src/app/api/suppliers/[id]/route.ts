import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

const supplierSchema = z.object({
  name: z.string().min(1).max(100),
  contact: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(100).optional().or(z.literal('')),
  address: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  const user = (request as any).user;
  const { id } = await params;

  const supplier = await queryOne(
    'SELECT * FROM suppliers WHERE id = ? AND user_id = ?',
    [id, user.userId]
  );

  if (!supplier) {
    return NextResponse.json({ error: 'Pemasok tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json(supplier);
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
    const parsed = supplierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, contact, phone, email, address } = parsed.data;

    const existing = await queryOne('SELECT id FROM suppliers WHERE id = ? AND user_id = ?', [id, user.userId]);
    if (!existing) {
      return NextResponse.json({ error: 'Pemasok tidak ditemukan' }, { status: 404 });
    }

    await execute(
      `UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ?, address = ? WHERE id = ? AND user_id = ?`,
      [name, contact || null, phone || null, email || null, address || null, id, user.userId]
    );

    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [id]);
    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Update supplier error:', error);
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

  const existing = await queryOne('SELECT id FROM suppliers WHERE id = ? AND user_id = ?', [id, user.userId]);
  if (!existing) {
    return NextResponse.json({ error: 'Pemasok tidak ditemukan' }, { status: 404 });
  }

  await execute('DELETE FROM suppliers WHERE id = ? AND user_id = ?', [id, user.userId]);
  return NextResponse.json({ message: 'Pemasok dihapus' });
}