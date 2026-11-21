import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refreshToken')?.value;
    
    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token tidak ditemukan' }, { status: 401 });
    }

    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      return NextResponse.json({ error: 'Refresh token tidak valid atau kadaluarsa' }, { status: 401 });
    }

    const storedToken = await queryOne<{ id: number; revoked_at: string | null }>(
      'SELECT id, revoked_at FROM refresh_tokens WHERE user_id = ? AND token_hash = SHA2(?, 256)',
      [payload.userId, refreshToken]
    );

    if (!storedToken || storedToken.revoked_at) {
      return NextResponse.json({ error: 'Refresh token dicabut' }, { status: 401 });
    }

    await execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [storedToken.id]);

    const user = await queryOne<{
      id: number;
      username: string;
      email: string;
      role: string;
    }>('SELECT id, username, email, role FROM users WHERE id = ?', [payload.userId]);

    if (!user) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    const newAccessToken = await generateAccessToken(tokenPayload);
    const newRefreshToken = await generateRefreshToken(tokenPayload);

    await execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
       VALUES (?, SHA2(?, 256), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [user.id, newRefreshToken]
    );

    const response = NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

    response.cookies.set('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}