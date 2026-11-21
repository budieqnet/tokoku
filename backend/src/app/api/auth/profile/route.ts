import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const profileSchema = z.object({
  full_name: z.string().min(1, 'Nama lengkap wajib diisi').max(100).optional(),
  email: z.string().email('Format email tidak valid').max(100).optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Password saat ini wajib diisi'),
  new_password: z.string().min(8, 'Password baru minimal 8 karakter'),
  confirm_password: z.string().min(1, 'Konfirmasi password wajib diisi'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirm_password'],
});

async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = getTokenFromHeader(authHeader);
  
  if (!accessToken) {
    return { error: 'Token tidak ditemukan', status: 401 };
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return { error: 'Token tidak valid atau kadaluarsa', status: 401 };
  }

  const user = await queryOne<{
    id: number;
    username: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    created_at: string | Date;
  }>('SELECT id, username, email, full_name, avatar_url, role, created_at FROM users WHERE id = ?', [payload.userId]);

  if (!user) {
    return { error: 'User tidak ditemukan', status: 404 };
  }

  return { user, payload };
}

// GET /api/auth/profile - Get user profile
export async function GET(request: NextRequest) {
  try {
    const result = await getUserFromToken(request);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ user: result.user });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/auth/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const result = await getUserFromToken(request);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const body = await request.json();
    const parsed = profileSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { full_name, email } = parsed.data;
    const updates: string[] = [];
    const params: any[] = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name);
    }
    if (email !== undefined) {
      // Check if email already exists for another user
      const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = ? AND id != ?', [email, result.user.id]);
      if (existing) {
        return NextResponse.json({ error: 'Email sudah digunakan oleh user lain' }, { status: 400 });
      }
      updates.push('email = ?');
      params.push(email);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data yang diubah' }, { status: 400 });
    }

    params.push(result.user.id);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    // Fetch updated user
    const updatedUser = await queryOne<{
      id: number;
      username: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
      role: string;
      created_at: string | Date;
    }>('SELECT id, username, email, full_name, avatar_url, role, created_at FROM users WHERE id = ?', [result.user.id]);

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/auth/profile/change-password - Change password
export async function PATCH(request: NextRequest) {
  try {
    const result = await getUserFromToken(request);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { current_password, new_password } = parsed.data;

    // Get user with password hash
    const userWithPassword = await queryOne<{
      id: number;
      password_hash: string;
    }>('SELECT id, password_hash FROM users WHERE id = ?', [result.user.id]);

    if (!userWithPassword) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    // Verify current password
    const isValid = await verifyPassword(current_password, userWithPassword.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: 'Password saat ini tidak benar' }, { status: 400 });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(new_password);

    // Update password
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, result.user.id]);

    return NextResponse.json({ message: 'Password berhasil diubah' });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/auth/profile/upload-avatar - Upload avatar
export async function POST(request: NextRequest) {
  try {
    const result = await getUserFromToken(request);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'File avatar tidak ditemukan' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Format file tidak didukung. Gunakan JPEG, PNG, WebP, atau GIF' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Ukuran file terlalu besar. Maksimal 5MB' }, { status: 400 });
    }

    // Create upload directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `avatar_${result.user.id}_${timestamp}.${extension}`;
    const filepath = join(uploadDir, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Update user avatar_url
    const avatarUrl = `/uploads/avatars/${filename}`;
    await execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, result.user.id]);

    return NextResponse.json({ 
      message: 'Avatar berhasil diupload',
      avatar_url: avatarUrl 
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}