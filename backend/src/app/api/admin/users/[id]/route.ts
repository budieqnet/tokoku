import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
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

const updateUserSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(100).optional(),
  role: z.enum(['admin', 'user']).optional(),
  is_active: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Tidak ada data yang diubah',
});

const resetPasswordSchema = z.object({
  new_password: z.string().min(8).max(100),
  confirm_password: z.string().min(1),
}).refine(data => data.new_password === data.confirm_password, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirm_password'],
});

// GET /api/admin/users/[id] - Get single user
export async function GET(
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

    const targetUser = await queryOne<{
      id: number;
      username: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
      role: string;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
      updated_at: string;
    }>('SELECT id, username, email, full_name, avatar_url, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ?', [targetUserId]);

    if (!targetUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ user: targetUser });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/users/[id] - Update user
export async function PUT(
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

    // Prevent self-modification of role/status
    if (targetUserId === authResult.user.id) {
      return NextResponse.json({ error: 'Tidak bisa mengubah data sendiri' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { full_name, email, role, is_active } = parsed.data;
    const updates: string[] = [];
    const updateParams: any[] = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      updateParams.push(full_name);
    }
    if (email !== undefined) {
      const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = ? AND id != ?', [email, targetUserId]);
      if (existing) {
        return NextResponse.json({ error: 'Email sudah digunakan oleh user lain' }, { status: 400 });
      }
      updates.push('email = ?');
      updateParams.push(email);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      updateParams.push(role);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      updateParams.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data yang diubah' }, { status: 400 });
    }

    updateParams.push(targetUserId);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, updateParams);

    const updatedUser = await queryOne<{
      id: number;
      username: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
      role: string;
      is_active: boolean;
      created_at: string;
    }>('SELECT id, username, email, full_name, avatar_url, role, is_active, created_at FROM users WHERE id = ?', [targetUserId]);

    if (!updatedUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - Delete user
export async function DELETE(
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

    // Prevent self-deletion
    if (targetUserId === authResult.user.id) {
      return NextResponse.json({ error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 });
    }

    const targetUser = await queryOne<{ id: number; role: string }>('SELECT id, role FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    // Prevent deleting another admin
    if (targetUser.role === 'admin') {
      return NextResponse.json({ error: 'Tidak bisa menghapus admin lain' }, { status: 400 });
    }

    await execute('DELETE FROM users WHERE id = ?', [targetUserId]);

    return NextResponse.json({ message: 'User berhasil dihapus' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

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