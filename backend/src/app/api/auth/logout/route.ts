import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { getTokenFromHeader, verifyAccessToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = getTokenFromHeader(authHeader);
    const refreshToken = request.cookies.get('refreshToken')?.value;

    if (accessToken) {
      const payload = await verifyAccessToken(accessToken);
      if (payload && refreshToken) {
        await execute(
          'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND token_hash = SHA2(?, 256)',
          [payload.userId, refreshToken]
        );
      }
    }

    const response = NextResponse.json({ message: 'Logout berhasil' });
    response.cookies.set('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}