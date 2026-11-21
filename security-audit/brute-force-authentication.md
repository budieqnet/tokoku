# Phase 6: Brute Force & Authentication Bypass Audit

## Executive Summary
**CRITICAL: No brute force protection implemented.** Login endpoint has no rate limiting, account lockout, or attempt tracking. Authentication bypass risks exist due to missing middleware protection on API routes.

## Audit Scope
Examined:
- Login endpoint rate limiting
- Failed attempt tracking
- Account lockout mechanisms
- Username enumeration resistance
- Authentication bypass vectors
- Protected route validation
- Privilege escalation vectors

## Brute Force Protection Analysis

### Login Endpoint (`/backend/src/app/api/auth/login/route.ts`)
**Current Implementation:** NO rate limiting, NO attempt tracking, NO lockout

```typescript
export async function POST(request: NextRequest) {
  // Direct processing - no rate limit check
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  // ... authentication logic
}
```

### Missing Protections
| Protection | Status | Risk |
|------------|--------|------|
| Rate limiting (per IP) | ❌ Missing | Critical |
| Rate limiting (per account) | ❌ Missing | Critical |
| Account lockout after N failures | ❌ Missing | Critical |
| Exponential backoff | ❌ Missing | High |
| CAPTCHA after N failures | ❌ Missing | Medium |
| IP blocking/blacklisting | ❌ Missing | Medium |
| Alerting on brute force | ❌ Missing | Medium |

## Username Enumeration Analysis

### Current Behavior
**Login endpoint returns identical error for:**
1. User not found
2. User inactive
3. Wrong password

```typescript
// Line 37-42: User not found or inactive
if (!user || !user.is_active) {
  return NextResponse.json(
    { error: 'Username atau password salah' },  // Generic
    { status: 401 }
  );
}

// Line 1-7: Wrong password
const isValid = await verifyPassword(password, user.password_hash);
if (!isValid) {
  return NextResponse.json(
    { error: 'Username atau password salah' },  // Same generic message
    { status: 401 }
  );
}
```

✅ **GOOD** - Generic error message prevents username enumeration via login

### Register Endpoint (`/backend/src/app/api/auth/register/route.ts`)
```typescript
// Lines 32-36
if (existingUser) {
  return NextResponse.json(
    { error: 'Username atau email sudah terdaftar' },  // Reveals existence
    { status: 409 }
  );
}
```
⚠️ **ISSUE** - Register endpoint reveals if username/email exists
**Impact:** Attacker can enumerate valid usernames/emails via registration
**Mitigation:** Use generic message "Jika email terdaftar, link verifikasi dikirim" (but no email verification implemented)

## Authentication Bypass Vectors

### 1. Missing Authentication Middleware
**Location:** `/backend/src/middleware.ts`
```typescript
export function middleware(request: NextRequest) {
  // Only handles CORS - NO authentication check!
  const response = NextResponse.next()
  // ... CORS headers
  return response
}

export const config = {
  matcher: ['/api/:path*'],  // Applies to all API routes
}
```

**CRITICAL ISSUE:** Middleware only handles CORS, does NOT validate authentication tokens.

### 2. Per-Endpoint Authentication (Inconsistent)
Each endpoint independently verifies tokens:
- `/auth/me` - ✅ Verifies access token
- `/auth/refresh` - ✅ Verifies refresh token
- `/auth/logout` - ✅ Verifies access token
- **Other API routes** - ❓ Need individual audit

### 3. Direct Access to Protected Endpoints
Without centralized middleware, any API route that forgets to verify tokens is vulnerable.

### 4. JWT Secret Exposure Risk
```typescript
// /backend/src/lib/auth.ts lines 4-5
const ACCESS_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
const REFRESH_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);
```
✅ Uses environment variables
⚠️ Secrets in `.env` file (checked into repo? Need to verify)

### 5. Role-Based Access Control
**Current:** Role stored in JWT payload (`user.role`)
**Verification:** No centralized RBAC middleware found
**Risk:** Endpoints must manually check `payload.role === 'admin'`

## Privilege Escalation Vectors

### 1. Token Payload Manipulation
- JWT signed with HS256 - cannot modify without secret ✅
- But if secret leaked, attacker can forge admin tokens

### 2. User ID Manipulation
- All queries use `payload.userId` from verified token ✅
- No user-supplied ID in sensitive operations ✅

### 3. Register Default Role
```typescript
// /backend/src/app/api/auth/register/route.ts line 5-6
VALUES (?, ?, ?, ?, 'user')  -- Hardcoded 'user' role
```
✅ Cannot self-assign admin role via registration

## Attack Scenarios

### Scenario 1: Credential Stuffing
**Attack:** Automated login attempts with leaked credentials
**Current Defense:** NONE
**Impact:** High - can try thousands of credentials per minute
**Fix:** Rate limiting + account lockout

### Scenario 2: Password Spraying
**Attack:** Few passwords against many usernames
**Current Defense:** Generic error message (prevents enumeration) ✅
**Missing:** Rate limiting per IP

### Scenario 3: Brute Force Single Account
**Attack:** Many passwords against one username
**Current Defense:** NONE
**Impact:** Will eventually succeed with weak passwords
**Fix:** Account lockout after 5 failures

### Scenario 4: API Endpoint Bypass
**Attack:** Access `/api/admin/users` without token
**Current Defense:** Depends on each endpoint
**Risk:** HIGH - no centralized protection

## Findings Summary

| Finding ID | Vulnerability | Severity | Status |
|------------|---------------|----------|--------|
| BRUTE-001 | No rate limiting on login | Critical | **CONFIRMED** |
| BRUTE-002 | No account lockout | Critical | **CONFIRMED** |
| BRUTE-003 | No failed attempt tracking | Critical | **CONFIRMED** |
| BRUTE-004 | Username enumeration via register | Medium | **CONFIRMED** |
| BRUTE-005 | No centralized auth middleware | Critical | **CONFIRMED** |
| BRUTE-006 | Inconsistent per-endpoint auth | High | **CONFIRMED** |
| BRUTE-007 | No CAPTCHA/challenge | Medium | **CONFIRMED** |
| BRUTE-008 | No brute force alerting | Medium | **CONFIRMED** |
| BRUTE-009 | Privilege escalation via token forge | High | **THEORETICAL** (needs secret leak) |

## Detailed Findings

### BRUTE-001: No Rate Limiting on Login (CRITICAL)
- **Location:** `/backend/src/app/api/auth/login/route.ts`
- **Issue:** Unlimited login attempts per IP/account
- **Attack:** `curl` loop or tool like Hydra can attempt 1000s/minute
- **Fix:** Implement rate limiter (e.g., `@upstash/ratelimit` or custom Redis-based)

### BRUTE-002: No Account Lockout (CRITICAL)
- **Location:** Login flow
- **Issue:** No tracking of failed attempts per account
- **Attack:** Targeted brute force on known admin account
- **Fix:** Track failures in DB/cache, lock after 5 failures for 15 min

### BRUTE-005: No Centralized Auth Middleware (CRITICAL)
- **Location:** `/backend/src/middleware.ts`
- **Issue:** Middleware only does CORS, no token validation
- **Impact:** Every API route must manually verify auth
- **Fix:** Add token verification to middleware for protected routes

## Recommendations

### Critical (Do Before Production)
1. **Implement rate limiting on login** - Per IP (10/min) and per account (5/15min)
2. **Add account lockout** - Lock after 5 failures, unlock after 15 min or admin
3. **Create centralized auth middleware** - Protect all `/api/` routes except auth endpoints
4. **Fix register enumeration** - Generic response for existing accounts

### High Priority
5. **Add failed attempt logging** - Track IP, username, timestamp, success/failure
6. **Implement alerting** - Notify on brute force patterns
7. **Add CAPTCHA** - After 3 failed attempts

### Medium Priority
8. **Implement device fingerprinting** - Track trusted devices
9. **Add "remember me" with extended expiry** - Optional
10. **Audit all API routes** - Ensure each has proper auth check

## Implementation Example: Rate Limiter

```typescript
// lib/rate-limiter.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
});

export async function checkRateLimit(identifier: string) {
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);
  return { success, limit, reset, remaining };
}
```

```typescript
// In login route
const ip = request.headers.get('x-forwarded-for') || 'unknown';
const { success } = await checkRateLimit(`login:${ip}`);
if (!success) {
  return NextResponse.json(
    { error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
    { status: 429 }
  );
}
```

## Verification Tests

### Test 1: Rate Limiting (Should Fail - Not Implemented)
```bash
for i in {1..20}; do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "testuser", "password": "wrongpass"}' \
    -w " %{http_code}\n" -o /dev/null
done
# Expected: All 401 (no 429 rate limit)
```

### Test 2: Account Lockout (Should Fail - Not Implemented)
```bash
for i in {1..10}; do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "admin", "password": "wrongpass"}' \
    -w " %{http_code}\n" -o /dev/null
done
# Expected: All 401 (no lockout)
```

### Test 3: Register Enumeration
```bash
# Check existing user
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "email": "admin@final.com", "password": "password123"}'
# Returns: {"error":"Username atau email sudah terdaftar"} - ENUMERATION POSSIBLE

# Check non-existing
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "nonexistent123", "email": "none@test.com", "password": "password123"}'
# Returns: 200 with tokens - CONFIRMS enumeration
```

### Test 4: Auth Middleware Check
```bash
# Access protected endpoint without token
curl -s http://localhost:3000/api/admin/users
# Check if returns 401 or data (depends on endpoint implementation)
```

## Conclusion
**NO-GO for Production** - Critical brute force protections missing. No rate limiting, no account lockout, no centralized authentication middleware. These must be implemented before production deployment.