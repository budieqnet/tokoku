import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, transaction } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';

interface Customer {
  id: number;
  user_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;

    // Get customer data
    const customer = await queryOne<Customer>(
      'SELECT * FROM customers WHERE id = ? AND user_id = ?',
      [id, user.userId]
    );

    if (!customer) {
      return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 });
    }

    // Check if partner with same name already exists for this user
    const existingPartner = await queryOne(
      'SELECT id FROM partners WHERE user_id = ? AND name = ?',
      [user.userId, customer.name]
    );

    if (existingPartner) {
      return NextResponse.json(
        { error: 'Mitra dengan nama yang sama sudah ada' },
        { status: 400 }
      );
    }

    // Use transaction to ensure atomicity
    const partnerId = await transaction(async (conn) => {
      // Create partner from customer data
      const [partnerResult] = await conn.execute(
        `INSERT INTO partners (user_id, name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          user.userId,
          customer.name,
          customer.name, // contact = name (fallback)
          customer.phone,
          customer.email,
          customer.address,
        ]
      );

      const newPartnerId = (partnerResult as any).insertId;

      // Optionally delete the customer after successful migration
      await conn.execute('DELETE FROM customers WHERE id = ? AND user_id = ?', [id, user.userId]);

      return newPartnerId;
    });

    const partner = await queryOne('SELECT * FROM partners WHERE id = ?', [partnerId]);

    return NextResponse.json({
      message: 'Pelanggan berhasil dimigrasi ke Mitra',
      partner,
    }, { status: 201 });
  } catch (error) {
    console.error('Migrate customer to partner error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}