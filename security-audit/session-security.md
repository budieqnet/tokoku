# Phase 5: Session & Cookie Security Audit

## Executive Summary
**Session management is well-implemented with JWT tokens and secure cookie configuration.** Key strengths: HttpOnly cookies, token rotation, short access token expiry. Areas for improvement: Secure cookie in development, SameSite strict option, session fixation protection.

## Audit Scope
Examined session/cookie handling in:
- Login endpoint (`/backend/src/app/api/auth/login/route.ts`)
- Refresh endpoint (`/backend/src/app/api/auth/refresh/route.ts`)
- Logout endpoint (`/backend/src/app/api/auth/logout/route.ts`)
- Auth library (`/backend/src/lib/auth.ts`)
- Frontend token management (`/frontend/src/stores/auth.ts`, `/frontend/src/services/api.ts`)

## Cookie Configuration Analysis

### Refresh Token Cookie (Login - lines 41-47)
```typescript
response.cookies.set('refreshToken', refreshToken, {
  httpOnly: true,                                    // ✅ Prevents XSS theft
  secure: process.env.NODE_ENV === 'production',     // ⚠️ Only in production
  sameSite: 'lax',                                   // ✅ Good (consider 'strict')
  maxAge: 60 * 60 * 24 * 7,                         // ✅ 7 days matches token expiry
  path: '/',                                         // ✅ Available on all paths
});
```

### Refresh Token Cookie (Refresh - lines 15-21)
```typescript
response.cookies.set('refreshToken', newRefreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
});
```

### Logout Cookie Clearing (lines 22-28)
```typescript
response.cookies.set('refreshToken', '', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 0,                                         // ✅ Expires immediately
  path: '/',
});
```

## Cookie Security Assessment

| Attribute | Value | Assessment |
|-----------|-------|------------|
| HttpOnly | `true` | ✅ Excellent - prevents JavaScript access |
| Secure | `production only` | ⚠️ **Issue** - should be true in staging too |
| SameSite | `lax` | ✅ Good - consider `strict` for higher security |
| Path | `/` | ✅ Standard |
| MaxAge | 7 days | ✅ Matches token expiry |
| Domain | Not set | ✅ Defaults to current host |

### Critical Issue: Secure Cookie in Development
**Problem:** `secure: process.env.NODE_ENV === 'production'` means cookies sent over HTTP in development
**Impact:** 
- Works locally but creates false sense of security
- Staging environments without HTTPS will fail
- Developers may not test secure cookie behavior

**Recommendation:** Use HTTPS in development (mkcert) or set `secure: true` always with proper certs

## Token Management

### Access Token
- **Storage:** localStorage (frontend) + Authorization header
- **Expiry:** 15 minutes (`JWT_ACCESS_EXPIRY=15m`)
- **Algorithm:** HS256
- **Payload:** userId, username, email, role, type: 'access'

### Refresh Token
- **Storage:** HttpOnly cookie (primary) + localStorage (backup)
- **Expiry:** 7 days (`JWT_REFRESH_EXPIRY=7d`)
- **Algorithm:** HS256
- **Database:** SHA2-256 hash stored with expiry and revocation status
- **Rotation:** Yes - old token revoked on each refresh

## Token Rotation Implementation (`/backend/src/app/api/auth/refresh/route.ts`)

```typescript
// 1. Verify incoming refresh token
const payload = await verifyRefreshToken(refreshToken);

// 2. Check database for valid, non-revoked token
const storedToken = await queryOne(... WHERE user_id = ? AND token_hash = SHA2(?, 256));

// 3. Revoke old token
await execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [storedToken.id]);

// 4. Generate new token pair
const newAccessToken = await generateAccessToken(tokenPayload);
const newRefreshToken = await generateRefreshToken(tokenPayload);

// 5. Store new refresh token hash
await execute(`INSERT INTO refresh_tokens ...`, [user.id, newRefreshToken]);
```

✅ **EXCELLENT** - Proper token rotation prevents replay attacks

## Session Fixation Protection

### Current State
- New tokens generated on each login ✅
- Refresh token rotated on each use ✅
- No explicit session ID regeneration (using JWT) ✅

### Assessment
**JWT-based sessions are inherently resistant to fixation** because:
1. Token is cryptographically signed
2. New token generated on each authentication
3. No server-side session ID to fixate

## Session Invalidation

### Logout (`/backend/src/app/api/auth/logout/route.ts`)
```typescript
// Revoke refresh token in database
await execute(
  'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND token_hash = SHA2(?, 256)',
  [payload.userId, refreshToken]
);

// Clear cookie
response.cookies.set('refreshToken', '', { maxAge: 0, ... });
```
✅ **GOOD** - Server-side revocation + client-side cookie clearing

### Token Expiry
- Access token: 15 min (self-expiring via JWT exp claim)
- Refresh token: 7 days (database expiry + JWT exp claim)

## Concurrent Session Handling

### Current Behavior
- Multiple refresh tokens per user allowed (no limit)
- Each login creates new refresh token
- No "logout all devices" feature

### Risk Assessment
**Medium** - Stolen refresh token valid until:
1. Used (rotation invalidates it)
2. Expires (7 days)
3. Manually revoked (logout)

### Recommendation
- Add max concurrent sessions limit (e.g., 5)
- Add "revoke all sessions" endpoint
- Track device info (user agent, IP) for session management

## Frontend Token Handling (`/frontend/src/stores/auth.ts`)

### Storage
```typescript
const accessToken = ref<string | null>(localStorage.getItem('accessToken'))
const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'))
```
⚠️ **RISK** - Access token in localStorage vulnerable to XSS
**Mitigation:** Short expiry (15 min) limits exposure window

### Auto-refresh (`/frontend/src/services/api.ts` lines 10-44)
```typescript
if (error.response?.status === 401 && !originalRequest._retry) {
  originalRequest._retry = true;
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await axios.post(`/api/auth/refresh`, {}, { 
    headers: { Authorization: `Bearer ${refreshToken}` } 
  });
  // Update tokens and retry
}
```
✅ **GOOD** - Automatic token refresh on 401

## Security Headers (Missing)

### Recommended Headers for Next.js
```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]
```

## Findings Summary

| Finding ID | Vulnerability | Severity | Status |
|------------|---------------|----------|--------|
| SES-001 | Secure cookie only in production | Medium | **CONFIRMED** |
| SES-002 | Access token in localStorage | Medium | **CONFIRMED** (mitigated by short expiry) |
| SES-003 | No concurrent session limit | Medium | **CONFIRMED** |
| SES-004 | Missing security headers | Low | **CONFIRMED** |
| SES-005 | SameSite lax (not strict) | Low | **CONFIRMED** |
| SES-006 | Session fixation | Critical | **NOT FOUND** (JWT resistant) |
| SES-007 | Token rotation missing | Critical | **NOT FOUND** (implemented) |
| SES-008 | Refresh token not HttpOnly | Critical | **NOT FOUND** (HttpOnly set) |

## Detailed Findings

### SES-001: Secure Cookie Only in Production
- **Severity:** Medium
- **Location:** `/backend/src/app/api/auth/login/route.ts` line 43, `/backend/src/app/api/auth/refresh/route.ts` line 17
- **Issue:** `secure: process.env.NODE_ENV === 'production'`
- **Impact:** Cookies transmitted over HTTP in development/staging without HTTPS
- **Fix:** Use HTTPS everywhere or set `secure: true` with valid certs

### SES-002: Access Token in localStorage
- **Severity:** Medium
- **Location:** `/frontend/src/stores/auth.ts` lines 17, 35
- **Issue:** Access token stored in localStorage (accessible via XSS)
- **Mitigation:** 15-minute expiry limits window
- **Fix:** Consider storing in memory only, or use HttpOnly cookie for access token too

### SES-003: No Concurrent Session Limit
- **Severity:** Medium
- **Location:** Database schema allows unlimited refresh_tokens per user
- **Impact:** Unlimited concurrent sessions, no "logout all devices"
- **Fix:** Add max_sessions limit, device tracking, revoke-all endpoint

## Recommendations

### Critical (Do Before Production)
1. **Enable HTTPS in all environments** - Fix secure cookie issue
2. **Add security headers** - CSP, X-Frame-Options, etc.

### High Priority
3. **Implement session limits** - Max 5 concurrent sessions per user
4. **Add "revoke all sessions"** - Security feature for users

### Medium Priority
5. **Consider SameSite: strict** - For higher security (may break some flows)
6. **Move access token to memory** - Reduce XSS exposure
7. **Add device fingerprinting** - Track sessions per device

### Low Priority
8. **Session activity logging** - Audit trail for security events
9. **Geolocation anomaly detection** - Flag impossible travel

## Verification Tests

### Test 1: Cookie Attributes
```bash
curl -v -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}' \
  2>&1 | grep -i "set-cookie"
# Check: HttpOnly, Secure, SameSite, Path, Max-Age
```

### Test 2: Token Rotation
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}' | jq -r .refreshToken)

# 2. Refresh twice with same token (second should fail)
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Cookie: refreshToken=$TOKEN"

curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Cookie: refreshToken=$TOKEN"
# Second should return 401 "Refresh token dicabut"
```

### Test 3: Logout Revocation
```bash
# Login, then logout, then try refresh
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Cookie: refreshToken=$REFRESH_TOKEN"

curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Cookie: refreshToken=$REFRESH_TOKEN"
# Should return 401
```

## Conclusion
**PASS** - Session management is well-implemented with proper token rotation, HttpOnly cookies, and server-side revocation. Main issues are development-only secure cookie and missing security headers. JWT architecture provides inherent session fixation protection.