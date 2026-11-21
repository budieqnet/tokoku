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

const userListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  role: z.string().optional(),
  // "false" harus jadi false (z.coerce.boolean pakai Boolean("false") === true, bug)
  is_active: z.preprocess(
    (v) => {
      if (v === undefined || v === '') return undefined;
      if (typeof v === 'boolean') return v;
      if (v === 'true' || v === '1' || v === 1) return true;
      if (v === 'false' || v === '0' || v === 0) return false;
      return v;
    },
    z.boolean().optional()
  ),
});

const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().max(100),
  password: z.string().min(8).max(100),
  full_name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

// NOTE: PUT/DELETE/PATCH untuk /[id] dan /[id]/reset-password
// sudah ditangani di:
// - src/app/api/admin/users/[id]/route.ts
// - src/app/api/admin/users/[id]/reset-password/route.ts

// GET /api/admin/users - List users
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAdminUser(request);
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = userListSchema.safeParse(Object.fromEntries(searchParams));
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { page, limit, search, role, is_active } = parsed.data;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      whereClause += ' AND (username LIKE ? OR email LIKE ? OR full_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    if (role) {
      whereClause += ' AND role = ?';
      params.push(role);
    }
    if (is_active !== undefined) {
      whereClause += ' AND is_active = ?';
      params.push(is_active ? 1 : 0);
    }

    // Get total count
    const countResult = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // Get users
    const users = await query<{
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
    }>(
      `SELECT id, username, email, full_name, avatar_url, role, is_active, last_login_at, created_at, updated_at 
       FROM users ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/users - Create user
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAdminUser(request);
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { username, email, password, full_name, role } = parsed.data;

    // Check if username or email exists
    const existing = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing) {
      return NextResponse.json({ error: 'Username atau email sudah terdaftar' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const result = await execute(
      `INSERT INTO users (username, email, password_hash, full_name, role) 
       VALUES (?, ?, ?, ?, ?)`,
      [username, email, passwordHash, full_name || username, role]
    );

    const newUser = await queryOne<{
      id: number;
      username: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
      role: string;
      is_active: boolean;
      created_at: string;
    }>('SELECT id, username, email, full_name, avatar_url, role, is_active, created_at FROM users WHERE id = ?', [result.insertId]);

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
