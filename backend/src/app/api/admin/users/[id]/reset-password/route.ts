import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { z } from 'zod';

async function getAdminUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = getTokenFromHeader(authHeader);
  
  if (!accessToken) {
    return { error: 'Token tidak ditemukan', status: 401 };
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return { error: 'Token tidak valid atau kadaluarsa', status: 401 };
  }

  if (payload.role !== 'admin') {
    return { error: 'Akses ditolak: hanya admin', status: 403 };
  }

  const user = await queryOne<{
    id: number;
    username: string;
    email: string;
    full_name: string | null;
    role: string;
  }>('SELECT id, username, email, full_name, role FROM users WHERE id = ?', [payload.userId]);

  if (!user) {
    return { error: 'User tidak ditemukan', status: 404 };
  }

  return { user, payload };
}

const resetPasswordSchema = z.object({
  new_password: z.string().min(8).max(100),
  confirm_password: z.string().min(1),
}).refine(data => data.new_password === data.confirm_password, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirm_password'],
});

// PATCH /api/admin/users/[id]/reset-password - Reset user password
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAdminUser(request);
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    
    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: 'ID user tidak valid' }, { status: 400 });
    }

    const targetUserId = Number(id);

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { new_password } = parsed.data;

    const targetUser = await queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    const passwordHash = await hashPassword(new_password);
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, targetUserId]);

    return NextResponse.json({ message: 'Password berhasil direset' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}