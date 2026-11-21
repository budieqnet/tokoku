# Phase 8: Remediation Plan

## Overview
Prioritized remediation tasks based on security audit findings. Each task includes technical details for implementation.

---

## A. Critical Fixes (Must Fix Before Production)

### Task CRIT-001: Implement Rate Limiting on Login
- **Finding ID:** BRUTE-001, BRUTE-002, BRUTE-003
- **Priority:** CRITICAL
- **Files to Modify:**
  - `/backend/src/app/api/auth/login/route.ts`
  - New: `/backend/src/lib/rate-limiter.ts`
- **Technical Requirements:**
  - Per-IP limit: 10 requests/minute
  - Per-account limit: 5 requests/15 minutes
  - Return 429 with retry-after header
  - Use Redis or in-memory store (Redis preferred for multi-instance)
- **Implementation:**
```typescript
// lib/rate-limiter.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const loginRateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});

export const accountRateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'),
});
```
```typescript
// In login route - add at start of POST handler
const ip = request.headers.get('x-forwarded-for') || 'unknown';
const { success: ipOk } = await loginRateLimiter.limit(`login:ip:${ip}`);
if (!ipOk) return NextResponse.json({ error: 'Terlalu banyak percobaan dari IP ini' }, { status: 429 });

const { success: accountOk } = await accountRateLimiter.limit(`login:account:${username}`);
if (!accountOk) return NextResponse.json({ error: 'Akun terkunci sementara' }, { status: 429 });
```
- **Testing:** Run 15 rapid login attempts, verify 429 response
- **Responsible:** Backend Developer

---

### Task CRIT-002: Implement Account Lockout Mechanism
- **Finding ID:** BRUTE-002
- **Priority:** CRITICAL
- **Files to Modify:**
  - `/backend/src/app/api/auth/login/route.ts`
  - Database: Add `failed_login_attempts`, `locked_until` columns to `users` table
- **Technical Requirements:**
  - Track failed attempts per account
  - Lock after 5 consecutive failures
  - Auto-unlock after 15 minutes
  - Reset counter on successful login
  - Admin can manually unlock
- **Database Migration:**
```sql
ALTER TABLE users 
ADD COLUMN failed_login_attempts INT UNSIGNED DEFAULT 0,
ADD COLUMN locked_until TIMESTAMP NULL;
```
- **Implementation:**
```typescript
// In login route - before password check
if (user.locked_until && new Date(user.locked_until) > new Date()) {
  return NextResponse.json({ error: 'Akun terkunci. Coba lagi nanti.' }, { status: 423 });
}

// On failed password
await execute(
  'UPDATE users SET failed_login_attempts = failed_login_attempts + 1, locked_until = CASE WHEN failed_login_attempts >= 4 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE) ELSE locked_until END WHERE id = ?',
  [user.id]
);

// On successful login
await execute('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
```
- **Testing:** Fail login 5 times, verify lockout; wait 15 min, verify unlock
- **Responsible:** Backend Developer + DevOps (migration)

---

### Task CRIT-003: Create Centralized Authentication Middleware
- **Finding ID:** BRUTE-005, BRUTE-006
- **Priority:** CRITICAL
- **Files to Modify:**
  - `/backend/src/middleware.ts` (replace)
  - `/backend/src/lib/auth.ts` (add helper)
- **Technical Requirements:**
  - Verify access token on all `/api/` routes except:
    - `/api/auth/login`
    - `/api/auth/register`
    - `/api/auth/refresh`
    - `/api/auth/logout`
  - Attach user payload to request for downstream use
  - Return 401 for invalid/missing tokens
- **Implementation:**
```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth';

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];

export async function middleware(request: NextRequest) {
  // CORS handling (existing)
  const response = NextResponse.next();
  const origin = request.headers.get('origin');
  // ... existing CORS code ...

  // Auth check
  const path = request.nextUrl.pathname;
  if (!PUBLIC_PATHS.some(p => path.startsWith(p))) {
    const authHeader = request.headers.get('authorization');
    const token = getTokenFromHeader(authHeader);
    
    if (!token) {
      return NextResponse.json({ error: 'Token tidak ditemukan' }, { status: 401 });
    }
    
    const payload = await verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Token tidak valid atau kadaluarsa' }, { status: 401 });
    }
    
    // Attach user to request headers for API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', String(payload.userId));
    requestHeaders.set('x-user-role', payload.role);
    
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
```
- **Testing:** Access protected endpoint without token → 401; with valid token → 200
- **Responsible:** Backend Developer

---

### Task CRIT-004: Fix Register Username Enumeration
- **Finding ID:** BRUTE-004
- **Priority:** CRITICAL
- **Files to Modify:**
  - `/backend/src/app/api/auth/register/route.ts`
- **Technical Requirements:**
  - Return generic success message regardless of whether account exists
  - If email verification implemented: "Jika email terdaftar, link verifikasi dikirim"
  - Current: "Registrasi berhasil. Silakan login."
- **Implementation:**
```typescript
// Replace lines 32-36
if (existingUser) {
  // Don't reveal existence - return same success response
  return NextResponse.json(
    { message: 'Registrasi berhasil. Silakan login.' },
    { status: 200 }
  );
}
```
- **Testing:** Register existing username → generic success; new username → generic success
- **Responsible:** Backend Developer

---

### Task CRIT-005: Enable Secure Cookies in All Environments
- **Finding ID:** SES-001
- **Priority:** CRITICAL
- **Files to Modify:**
  - `/backend/src/app/api/auth/login/route.ts` (line 43)
  - `/backend/src/app/api/auth/refresh/route.ts` (line 17)
- **Technical Requirements:**
  - Set `secure: true` always
  - Use HTTPS in development (mkcert) and staging/production
- **Implementation:**
```typescript
// Change from:
secure: process.env.NODE_ENV === 'production',
// To:
secure: true, // Requires HTTPS everywhere
```
- **DevOps Action:** Configure mkcert for local HTTPS, ensure staging has valid TLS
- **Testing:** Check cookie `Secure` flag in all environments
- **Responsible:** DevOps + Backend Developer

---

## B. Security Improvements (Should Fix Soon After Launch)

### Task SEC-001: Add Security Headers
- **Finding ID:** SES-004, XSS-004
- **Priority:** HIGH
- **Files to Modify:**
  - `/backend/next.config.ts`
- **Implementation:**
```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self';" },
];

module.exports = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // ... rest of config
};
```
- **Testing:** `curl -I` check all headers present
- **Responsible:** Backend Developer

---

### Task SEC-002: Strengthen Password Policy
- **Finding ID:** PWD-001, PWD-002
- **Priority:** HIGH
- **Files to Modify:**
  - `/backend/src/app/api/auth/register/route.ts`
  - New: `/backend/src/lib/password-policy.ts`
- **Implementation:**
```typescript
// lib/password-policy.ts
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Minimal 8 karakter');
  if (!/[A-Z]/.test(password)) errors.push('Harus mengandung huruf besar');
  if (!/[a-z]/.test(password)) errors.push('Harus mengandung huruf kecil');
  if (!/\d/.test(password)) errors.push('Harus mengandung angka');
  if (!/[@$!%*?&]/.test(password)) errors.push('Harus mengandung simbol (@$!%*?&)');
  return { valid: errors.length === 0, errors };
}

// Optional: Integrate HaveIBeenPwned
export async function checkBreachedPassword(password: string): Promise<boolean> {
  // Implement k-anonymity check with HaveIBeenPwned API
  return false; // placeholder
}
```
```typescript
// In register route - add after Zod validation
const { valid, errors } = validatePasswordStrength(password);
if (!valid) {
  return NextResponse.json({ error: 'Password lemah', details: errors }, { status: 400 });
}
```
- **Testing:** Register with weak passwords → 400 with details
- **Responsible:** Backend Developer

---

### Task SEC-003: Implement Concurrent Session Limits
- **Finding ID:** SES-003
- **Priority:** HIGH
- **Files to Modify:**
  - `/backend/src/app/api/auth/login/route.ts`
  - `/backend/src/app/api/auth/refresh/route.ts`
  - New: `/backend/src/lib/session-manager.ts`
- **Technical Requirements:**
  - Max 5 concurrent sessions per user
  - Track device info (user-agent, IP)
  - "Revoke all sessions" endpoint
- **Implementation:**
```typescript
// In login - before creating new refresh token
const activeSessions = await query(
  'SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()',
  [user.id]
);
if (activeSessions[0].count >= 5) {
  // Revoke oldest
  await execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at ASC LIMIT 1',
    [user.id]
  );
}
```
- **Testing:** Login from 6 different browsers → oldest session revoked
- **Responsible:** Backend Developer

---

### Task SEC-004: Audit Password Change Endpoint
- **Finding ID:** PWD-004
- **Priority:** HIGH
- **Files to Modify:**
  - Need to locate `/backend/src/app/api/auth/profile/route.ts` (PATCH)
- **Action:** Find and audit the profile update endpoint for password change logic
- **Responsible:** Backend Developer

---

### Task SEC-005: Move Access Token to Memory (Reduce XSS Exposure)
- **Finding ID:** SES-002
- **Priority:** MEDIUM
- **Files to Modify:**
  - `/frontend/src/stores/auth.ts`
  - `/frontend/src/services/api.ts`
- **Implementation:** Store access token in reactive variable only, not localStorage. Use HttpOnly cookie for access token if possible.
- **Responsible:** Frontend Developer

---

## C. Infrastructure Configuration (DevOps Tasks)

### Task INFRA-001: HTTPS Everywhere
- **Finding ID:** SES-001
- **Priority:** CRITICAL
- **Action:** 
  - Development: `mkcert` for local certificates
  - Staging: Valid TLS certificate (Let's Encrypt or paid)
  - Production: Valid TLS certificate with HSTS
- **Responsible:** DevOps

### Task INFRA-002: Redis for Rate Limiting
- **Finding ID:** BRUTE-001, BRUTE-002
- **Priority:** CRITICAL
- **Action:** Deploy Redis instance (Upstash, Railway, or self-hosted) for distributed rate limiting
- **Responsible:** DevOps

### Task INFRA-003: Secrets Management
- **Finding ID:** BRUTE-009 (theoretical)
- **Priority:** HIGH
- **Action:**
  - Remove `.env` from git (add to .gitignore)
  - Use secret manager (Vercel env, AWS Secrets Manager, etc.)
  - Rotate JWT secrets
- **Responsible:** DevOps

### Task INFRA-004: Security Monitoring & Alerting
- **Finding ID:** BRUTE-008
- **Priority:** MEDIUM
- **Action:**
  - Log all auth events (login success/failure, token refresh, logout)
  - Alert on: >10 failed logins/min from same IP, >5 failed logins on same account
  - Integrate with SIEM or logging service (Datadog, Sentry, etc.)
- **Responsible:** DevOps + Backend Developer

---

## Summary Table

| Task ID | Priority | Finding(s) | Effort | Owner |
|---------|----------|------------|--------|-------|
| CRIT-001 | Critical | BRUTE-001,002,003 | Medium | Backend |
| CRIT-002 | Critical | BRUTE-002 | Medium | Backend + DevOps |
| CRIT-003 | Critical | BRUTE-005,006 | Medium | Backend |
| CRIT-004 | Critical | BRUTE-004 | Low | Backend |
| CRIT-005 | Critical | SES-001 | Low | DevOps + Backend |
| SEC-001 | High | SES-004, XSS-004 | Low | Backend |
| SEC-002 | High | PWD-001,002 | Medium | Backend |
| SEC-003 | High | SES-003 | Medium | Backend |
| SEC-004 | High | PWD-004 | Low | Backend |
| SEC-005 | Medium | SES-002 | Medium | Frontend |
| INFRA-001 | Critical | SES-001 | Medium | DevOps |
| INFRA-002 | Critical | BRUTE-001,002 | Medium | DevOps |
| INFRA-003 | High | BRUTE-009 | Low | DevOps |
| INFRA-004 | Medium | BRUTE-008 | Medium | DevOps |

---

## Verification Checklist for Production Release

- [ ] Rate limiting returns 429 on login abuse
- [ ] Account locks after 5 failed attempts
- [ ] All protected API routes return 401 without token
- [ ] Register returns generic message for existing accounts
- [ ] Cookies have `Secure` flag in all environments
- [ ] Security headers present on all responses
- [ ] Password policy rejects weak passwords
- [ ] Max 5 concurrent sessions enforced
- [ ] Password change endpoint audited and secure
- [ ] HTTPS working in dev/staging/prod
- [ ] Redis deployed for rate limiting
- [ ] Secrets rotated and in secret manager
- [ ] Auth event logging and alerting configured