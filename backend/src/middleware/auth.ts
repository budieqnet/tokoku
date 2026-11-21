import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeader, verifyAccessToken, TokenPayload } from '@/lib/auth';

export interface AuthenticatedRequest extends NextRequest {
  user: TokenPayload;
}

export async function authMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const authHeader = request.headers.get('authorization');
  const accessToken = getTokenFromHeader(authHeader);
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Token tidak ditemukan' }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: 'Token tidak valid atau kadaluarsa' }, { status: 401 });
  }

  (request as AuthenticatedRequest).user = payload;
  return null;
}

export function requireRole(...allowedRoles: string[]) {
  return async function roleMiddleware(request: NextRequest): Promise<NextResponse | null> {
    const authResponse = await authMiddleware(request);
    if (authResponse) return authResponse;

    const user = (request as AuthenticatedRequest).user;
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Akses ditolak: role tidak mencukupi' }, { status: 403 });
    }

    return null;
  };
}