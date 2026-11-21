import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { queryOne } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = getTokenFromHeader(authHeader);
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Token tidak ditemukan' }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: 'Token tidak valid atau kadaluarsa' }, { status: 401 });
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
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}