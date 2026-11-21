import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

const customerSchema = z.object({
  name: z.string().min(1).max(100),
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

  const customer = await queryOne(
    'SELECT * FROM customers WHERE id = ? AND user_id = ?',
    [id, user.userId]
  );

  if (!customer) {
    return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json(customer);
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
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, phone, email, address } = parsed.data;

    const existing = await queryOne('SELECT id FROM customers WHERE id = ? AND user_id = ?', [id, user.userId]);
    if (!existing) {
      return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 });
    }

    await execute(
      `UPDATE customers SET name = ?, phone = ?, email = ?, address = ? WHERE id = ? AND user_id = ?`,
      [name, phone || null, email || null, address || null, id, user.userId]
    );

    const customer = await queryOne('SELECT * FROM customers WHERE id = ?', [id]);
    return NextResponse.json(customer);
  } catch (error) {
    console.error('Update customer error:', error);
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

  const existing = await queryOne('SELECT id FROM customers WHERE id = ? AND user_id = ?', [id, user.userId]);
  if (!existing) {
    return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 });
  }

  await execute('DELETE FROM customers WHERE id = ? AND user_id = ?', [id, user.userId]);
  return NextResponse.json({ message: 'Pelanggan dihapus' });
}