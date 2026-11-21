# Phase 1: Login Flow Analysis

## Authentication Architecture Overview

The Tokoku application implements a **JWT-based authentication system** with access tokens and refresh tokens, using bcrypt for password hashing.

## Complete Login Flow

### 1. Frontend Login Initiation (`/frontend/src/views/Login.vue`)
- User enters username and password
- Form submits to `authStore.login(username, password)` 
- No client-side validation beyond required fields

### 2. Auth Store Login (`/frontend/src/stores/auth.ts` - lines 23-45)
```typescript
async function login(username: string, password: string) {
  const response = await api.post('/auth/login', { username, password })
  const { user: userData, accessToken: access, refreshToken: refresh } = response.data
  
  user.value = userData
  accessToken.value = access
  refreshToken.value = refresh
  
  localStorage.setItem('accessToken', access)
  localStorage.setItem('refreshToken', refresh)
  api.defaults.headers.common['Authorization'] = `Bearer ${access}`
  
  return { success: true }
}
```

### 3. Backend Login Endpoint (`/backend/src/app/api/auth/login/route.ts`)

**Input Validation (lines 6-21):**
- Zod schema validates username (min 1) and password (min 1)
- Returns 400 if validation fails

**User Lookup (lines 25-35):**
```typescript
const user = await queryOne<{...}>(
  'SELECT id, username, email, password_hash, full_name, avatar_url, role, is_active, created_at 
   FROM users WHERE username = ?', 
  [username]
)
```
- Uses parameterized query (prepared statement) - **SAFE from SQL Injection**

**Account Status Check (lines 37-42):**
- Returns 401 if user not found OR `is_active = false`
- **Generic error message**: "Username atau password salah" - prevents username enumeration

**Password Verification (lines 1-7):**
```typescript
const isValid = await verifyPassword(password, user.password_hash)
if (!isValid) {
  return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 })
}
```
- Uses bcrypt.compare() - **secure password verification**
- Same generic error message - prevents username enumeration

**Last Login Update (line 9):**
```typescript
await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
```
- Parameterized query - **SAFE**

**Token Generation (lines 11-19):**
```typescript
const tokenPayload = {
  userId: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
}

const accessToken = await generateAccessToken(tokenPayload)
const refreshToken = await generateRefreshToken(tokenPayload)
```
- JWT tokens with HS256 algorithm
- Access token: 15 minutes expiry
- Refresh token: 7 days expiry

**Refresh Token Storage (lines 21-25):**
```typescript
await execute(
  `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
   VALUES (?, SHA2(?, 256), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
  [user.id, refreshToken]
)
```
- Stores SHA2-256 hash of refresh token - **secure storage**
- Parameterized query - **SAFE**

**Response with Cookies (lines 27-49):**
- Returns user data + accessToken + refreshToken in JSON body
- Sets `refreshToken` as HttpOnly cookie with:
  - `httpOnly: true` ✓
  - `secure: process.env.NODE_ENV === 'production'` ✓ (conditional)
  - `sameSite: 'lax'` ✓
  - `maxAge: 7 days` ✓
  - `path: '/'` ✓

### 4. Token Verification (`/backend/src/lib/auth.ts`)

**Access Token Verification (lines 9-17):**
```typescript
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET)
    if (payload.type !== 'access') return null
    return payload as TokenPayload
  } catch {
    return null
  }
}
```

**Refresh Token Verification (lines 19-27):**
```typescript
export async function verifyRefreshToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_SECRET)
    if (payload.type !== 'refresh') return null
    return payload as TokenPayload
  } catch {
    return null
  }
}
```

### 5. Token Refresh Flow (`/backend/src/app/api/auth/refresh/route.ts`)

1. Reads refresh token from HttpOnly cookie
2. Verifies JWT signature and type
3. Checks database for matching token hash AND not revoked
4. Revokes old refresh token (rotation)
5. Generates new access + refresh token pair
6. Stores new refresh token hash
7. Returns new tokens + sets new HttpOnly cookie

### 6. Logout Flow (`/backend/src/app/api/auth/logout/route.ts`)

1. Verifies access token from Authorization header
2. Revokes refresh token in database (sets `revoked_at = NOW()`)
3. Clears refreshToken cookie (maxAge: 0)
4. Returns success message

### 7. Session Validation (`/backend/src/app/api/auth/me/route.ts`)

1. Extracts access token from Authorization header
2. Verifies JWT signature and expiry
3. Fetches user from database by userId
4. Returns user data if valid

### 8. Frontend Token Management (`/frontend/src/services/api.ts`)

**Auto-refresh on 401 (lines 10-44):**
- Intercepts 401 responses
- Attempts refresh using refreshToken from localStorage
- Updates both tokens in localStorage and axios headers
- Redirects to /login on refresh failure

**Token Storage:**
- Access token: localStorage + Authorization header
- Refresh token: localStorage + HttpOnly cookie (backend)

## Authentication Guards

### Frontend Route Protection
- Uses `authStore.isAuthenticated` computed property
- `initAuth()` called on app initialization to restore session

### Backend Protection
- No centralized middleware for authentication (each endpoint verifies independently)
- `/api/auth/me` validates access token
- Other API endpoints need individual verification

## Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Frontend   │────▶│   Backend   │
│  (Login)    │     │  (Vue/Pinia)│     │  (Next.js)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           │  POST /auth/login  │
                           │ {username, pass}   │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Zod Valid  │     │  SELECT user│
                    │  bcrypt cmp │     │  UPDATE last│
                    │  JWT Sign   │     │  INSERT ref │
                    └─────────────┘     └─────────────┘
                           │                    │
                           │  {user, access,    │
                           │   refresh} + cookie│
                           ◀────────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ localStorage│
                    │ + Cookie    │
                    └─────────────┘
```

## Key Security Observations

| Aspect | Implementation | Status |
|--------|---------------|--------|
| Password Hashing | bcrypt cost 12 | ✅ Strong |
| SQL Injection Prevention | Parameterized queries | ✅ Protected |
| Username Enumeration | Generic error messages | ✅ Protected |
| Token Algorithm | HS256 (JWT) | ✅ Standard |
| Access Token Expiry | 15 minutes | ✅ Short |
| Refresh Token Expiry | 7 days | ⚠️ Long |
| Refresh Token Storage | SHA2-256 hash in DB | ✅ Secure |
| Refresh Token Rotation | Yes (on refresh) | ✅ Good |
| HttpOnly Cookie | Yes | ✅ Secure |
| Secure Cookie | Production only | ⚠️ Dev issue |
| SameSite | Lax | ✅ Good |
| Token Revocation on Logout | Yes | ✅ Good |
| Rate Limiting | **MISSING** | ❌ Critical |
| Brute Force Protection | **MISSING** | ❌ Critical |