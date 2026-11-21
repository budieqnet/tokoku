# Phase 2: SQL Injection Audit

## Executive Summary
**No SQL Injection vulnerabilities found in authentication endpoints.** All database queries use parameterized queries (prepared statements) via mysql2/promise's `pool.execute()` method.

## Audit Scope
Examined all authentication-related database queries in:
- `/backend/src/app/api/auth/login/route.ts`
- `/backend/src/app/api/auth/register/route.ts`
- `/backend/src/app/api/auth/refresh/route.ts`
- `/backend/src/app/api/auth/logout/route.ts`
- `/backend/src/app/api/auth/me/route.ts`
- `/backend/src/lib/db.ts` (database abstraction layer)

## Database Layer Analysis (`/backend/src/lib/db.ts`)

```typescript
export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function execute(sql: string, params?: any[]): Promise<{ insertId: number; affectedRows: number }> {
  const [result] = await pool.execute(sql, params);
  return result as { insertId: number; affectedRows: number };
}
```

**Assessment:** ✅ **SECURE**
- All queries use `pool.execute(sql, params)` - MySQL prepared statements
- Parameters are properly bound, never concatenated
- No dynamic SQL construction with user input

## Authentication Endpoints Analysis

### 1. Login Endpoint (`/backend/src/app/api/auth/login/route.ts`)

**Query 1 - User Lookup (line 25-35):**
```typescript
const user = await queryOne<{...}>(
  'SELECT id, username, email, password_hash, full_name, avatar_url, role, is_active, created_at 
   FROM users WHERE username = ?', 
  [username]
)
```
✅ **Parameterized** - username bound as parameter

**Query 2 - Last Login Update (line 9):**
```typescript
await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
```
✅ **Parameterized** - user.id bound as parameter

**Query 3 - Refresh Token Storage (lines 21-25):**
```typescript
await execute(
  `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
   VALUES (?, SHA2(?, 256), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
  [user.id, refreshToken]
)
```
✅ **Parameterized** - user.id and refreshToken bound as parameters

### 2. Register Endpoint (`/backend/src/app/api/auth/register/route.ts`)

**Query 1 - Existing User Check (lines 27-30):**
```typescript
const existingUser = await queryOne<{ id: number }>(
  'SELECT id FROM users WHERE username = ? OR email = ?',
  [username, email]
);
```
✅ **Parameterized** - username and email bound as parameters

**Query 2 - User Creation (lines 3-7):**
```typescript
const result = await execute(
  `INSERT INTO users (username, email, password_hash, full_name, role) 
   VALUES (?, ?, ?, ?, 'user')`,
  [username, email, passwordHash, full_name || username]
);
```
✅ **Parameterized** - all values bound as parameters

**Query 3 - User Fetch (lines 9-17):**
```typescript
const user = await queryOne<{...}>(
  'SELECT id, username, email, full_name, avatar_url, role, created_at FROM users WHERE id = ?', 
  [result.insertId]
);
```
✅ **Parameterized** - insertId bound as parameter

### 3. Refresh Endpoint (`/backend/src/app/api/auth/refresh/route.ts`)

**Query 1 - Token Validation (lines 18-21):**
```typescript
const storedToken = await queryOne<{ id: number; revoked_at: string | null }>(
  'SELECT id, revoked_at FROM refresh_tokens WHERE user_id = ? AND token_hash = SHA2(?, 256)',
  [payload.userId, refreshToken]
);
```
✅ **Parameterized** - userId and refreshToken bound as parameters

**Query 2 - Revoke Old Token (line 27):**
```typescript
await execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [storedToken.id]);
```
✅ **Parameterized** - storedToken.id bound as parameter

**Query 3 - User Fetch (lines 29-34):**
```typescript
const user = await queryOne<{...}>(
  'SELECT id, username, email, role FROM users WHERE id = ?', 
  [payload.userId]
);
```
✅ **Parameterized** - userId bound as parameter

**Query 4 - New Refresh Token Storage (lines 4-8):**
```typescript
await execute(
  `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
   VALUES (?, SHA2(?, 256), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
  [user.id, newRefreshToken]
);
```
✅ **Parameterized** - user.id and newRefreshToken bound as parameters

### 4. Logout Endpoint (`/backend/src/app/api/auth/logout/route.ts`)

**Query - Revoke Refresh Token (lines 14-17):**
```typescript
await execute(
  'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND token_hash = SHA2(?, 256)',
  [payload.userId, refreshToken]
);
```
✅ **Parameterized** - userId and refreshToken bound as parameters

### 5. Me Endpoint (`/backend/src/app/api/auth/me/route.ts`)

**Query - User Fetch (lines 19-27):**
```typescript
const user = await queryOne<{...}>(
  'SELECT id, username, email, full_name, avatar_url, role, created_at FROM users WHERE id = ?', 
  [payload.userId]
);
```
✅ **Parameterized** - userId bound as parameter

## Input Validation Layer

### Zod Schema Validation (Login)
```typescript
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
```
- Validates presence and type
- Rejects non-string inputs

### Zod Schema Validation (Register)
```typescript
const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().max(100),
  password: z.string().min(8).max(100),
  full_name: z.string().min(1).max(100).optional(),
});
```
- Strict format validation
- Username: alphanumeric + underscore only
- Email: valid email format
- Password: 8-100 characters

## Findings Summary

| Finding ID | Vulnerability | Severity | Status |
|------------|---------------|----------|--------|
| SQLI-001 | SQL Injection in login | Critical | **NOT FOUND** |
| SQLI-002 | SQL Injection in register | Critical | **NOT FOUND** |
| SQLI-003 | SQL Injection in refresh | Critical | **NOT FOUND** |
| SQLI-004 | SQL Injection in logout | Critical | **NOT FOUND** |
| SQLI-005 | SQL Injection in me | Critical | **NOT FOUND** |

## Root Cause Analysis
**No vulnerabilities found.** The application correctly uses:
1. mysql2/promise's `pool.execute()` with parameter binding
2. Zod schema validation for input sanitization
3. No string concatenation in SQL queries
4. No dynamic query construction with user input

## Recommendations

### Immediate (None Required)
No critical fixes needed for SQL injection.

### Security Improvements
1. **Add query logging in development** - Monitor for any future dynamic queries
2. **Consider ORM** - Prisma/Drizzle for additional type safety
3. **Database user permissions** - Ensure DB user has minimal required privileges

## Verification Method
```bash
# Test with SQL injection payloads (should all fail/return 401)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin'\'' OR 1=1--", "password": "anything"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "'\'' OR 1=1--"}'

# All should return: {"error":"Username atau password salah"} with 401
```

## Conclusion
**PASS** - Authentication endpoints are protected against SQL injection through consistent use of parameterized queries and input validation.