# Tokoku - Dokumentasi Proyek Lengkap

## Overview
Aplikasi manajemen toko (inventory, sales, purchases, customers, suppliers, partners, packages) dengan arsitektur **Full-Stack TypeScript**:
- **Backend**: Next.js 16 (App Router) + MySQL (mysql2) + JWT (jose) + Zod validation
- **Frontend**: Vue 3 + Vite + Pinia + Vue Router + Axios + TailwindCSS 3

---

## Struktur Direktori

```
/var/www/html/tokoku/
├── backend/                    # Next.js API Server (port 3000)
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/           # API Routes (REST)
│   │   │   │   ├── auth/      # login, register, refresh, me, logout
│   │   │   │   ├── customers/
│   │   │   │   ├── products/
│   │   │   │   ├── packages/
│   │   │   │   ├── partners/
│   │   │   │   ├── purchases/
│   │   │   │   ├── sales/
│   │   │   │   └── suppliers/
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── lib/
│   │   │   ├── db.ts          # MySQL connection pool + query helpers
│   │   │   └── auth.ts        # JWT (jose), bcrypt, token utilities
│   │   ├── middleware/
│   │   │   ├── auth.ts        # Auth middleware + role-based access
│   │   │   └── (middleware.ts) # CORS handling
│   │   └── middleware.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── .env.local
│
├── frontend/                   # Vue 3 + Vite (port 5173)
│   ├── src/
│   │   ├── components/
│   │   │   ├── DataTable.vue  # Reusable table dengan pagination, search, slots
│   │   ├── forms/             # Form components (ModalForm + entity forms)
│   │   │   ├── ModalForm.vue
│   │   │   ├── CustomerForm.vue
│   │   │   ├── PartnerForm.vue
│   │   │   ├── ProductForm.vue
│   │   │   ├── PackageForm.vue
│   │   │   ├── PurchaseForm.vue
  │   │   │   ├── SaleForm.vue
  │   │   │   ├── SupplierForm.vue
  │   │   │   └── SearchableSelect.vue
  │   │   └── HelloWorld.vue
  │   ├── layouts/
  │   │   └── DefaultLayout.vue  # Sidebar navigation + logout
  │   ├── router/
  │   │   └── index.ts           # Vue Router + auth guards
  │   ├── services/
  │   │   └── api.ts             # Axios instance + auto-refresh interceptor
  │   ├── stores/
  │   │   ├── auth.ts            # Pinia store: login, register, logout, token management
  │   │   └── products.ts        # Pinia store: products cache, stock updates
  │   ├── utils/
  │   │   └── alert.ts           # SweetAlert2 wrapper
  │   ├── views/                 # Page components (route targets)
  │   │   ├── Dashboard.vue
  │   │   ├── Login.vue
  │   │   ├── Register.vue
  │   │   ├── Customers.vue / CustomerForm.vue
  │   │   ├── Suppliers.vue / SupplierForm.vue
  │   │   ├── Partners.vue / PartnerForm.vue
  │   │   ├── Products.vue / ProductForm.vue
  │   │   ├── Purchases.vue
  │   │   ├── Sales.vue
  │   │   ├── Packages.vue / PackageForm.vue
  │   │   └── Finance.vue
  │   ├── App.vue
  │   ├── main.ts
  │   └── style.css
  │   ├── package.json
  │   ├── vite.config.ts         # Proxy /api -> http://localhost:3000
  │   └── tailwind.config.js
  │
├── tokoku_20260924-01.sql       # Database schema + seed data
└── PROJECT_DOCUMENTATION.md     # (file ini)
```

---

## Backend - Arsitektur Detail

### 1. Database Layer (`src/lib/db.ts`)
```typescript
// MySQL connection pool (mysql2/promise)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'budi',
  password: process.env.DB_PASSWORD || 'Budi@123',
  database: process.env.DB_NAME || 'tokoku',
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,
});

// Helper functions
export async function query<T>(sql: string, params?: any[]): Promise<T[]>
export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null>
export async function execute(sql: string, params?: any[]): Promise<{ insertId: number; affectedRows: number }>
export async function transaction<T>(callback: (conn) => Promise<T>): Promise<T>
```

### 2. Auth Layer (`src/lib/auth.ts`)
- **JWT Library**: `jose` (Edge-compatible, bukan `jsonwebtoken`)
- **Password**: `bcryptjs` (cost factor 12)
- **Token Types**:
  - Access Token: 15 menit (default), HS256, payload: `{userId, username, email, role, type: 'access'}`
  - Refresh Token: 7 hari (default), HS256, payload: `{userId, username, email, role, type: 'refresh'}`
- **Refresh Token Storage**: Database table `refresh_tokens` dengan `token_hash = SHA2(token, 256)`
- **Key Functions**:
  - `hashPassword()`, `verifyPassword()`
  - `generateAccessToken()`, `generateRefreshToken()`
  - `verifyAccessToken()`, `verifyRefreshToken()`
  - `getTokenFromHeader(authHeader)`

### 3. Middleware
- **`src/middleware.ts`**: CORS handling untuk origin `http://localhost:5173`, handle preflight OPTIONS
- **`src/middleware/auth.ts`**:
  - `authMiddleware(request)`: Validasi access token, attach `request.user` (TokenPayload)
  - `requireRole(...roles)`: Role-based access control (admin, manager, staff, kasir)

### 4. API Routes Pattern (Semua CRUD konsisten)
Setiap resource punya 2 file:
- `route.ts` (collection): `GET` (list + pagination + search), `POST` (create)
- `[id]/route.ts` (item): `GET`, `PUT`, `DELETE`

**Common Pattern**:
```typescript
export async function GET(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;
  const user = (request as any).user; // TokenPayload
  // query dengan user.userId untuk multi-tenancy
}

export async function POST(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;
  const user = (request as any).user;
  const body = await request.json();
  const parsed = schema.safeParse(body); // Zod validation
  // execute insert dengan user.userId
}
```

**Zod Schemas** per resource:
- `customerSchema`: name, phone, email, address
- `productSchema`: name, sku, buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id, supplier_name
- `packageSchema`: name, price, items[{product_id, qty}]
- `partnerSchema`: name, contact, phone, email, address
- `supplierSchema`: name, contact, phone, email, address
- `purchaseSchema`: product_id, product_name, sku, qty, price, supplier_id, supplier_name, customer_id, customer_name, purchase_date, notes
- `saleSchema`: product_id, product_name, sku, qty, price, subtotal, customer_id, customer_name, customer_type, partner_id, sale_date, notes

### 5. Auth Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Username + password → accessToken + refreshToken (cookie httpOnly) |
| `/api/auth/register` | POST | Register user baru (role default: staff) |
| `/api/auth/refresh` | POST | Refresh token (dari cookie) → new accessToken + refreshToken (rotate) |
| `/api/auth/me` | GET | Validasi access token (Authorization header) → user info |
| `/api/auth/logout` | POST | Revoke refresh token di DB, clear cookie |

---

## Database Schema (MySQL)

### Tables
| Table | Description | Key Columns |
|-------|-------------|-------------|
| `users` | Pengguna sistem | id, username, email, password_hash, full_name, role (admin/manager/staff/kasir), is_active |
| `refresh_tokens` | Token refresh storage | id, user_id, token_hash (SHA256), expires_at, revoked_at |
| `customers` | Pelanggan | id, user_id, name, phone, email, address |
| `suppliers` | Pemasok | id, user_id, name, contact, phone, email, address |
| `partners` | Mitra/Reseller | id, user_id, name, contact, phone, email, address |
| `products` | Produk/Barang | id, user_id, name, sku (unique per user), buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id, supplier_name |
| `packages` | Paket/Bundle produk | id, user_id, name, price |
| `package_items` | Items dalam paket | id, package_id, product_id, qty |
| `purchases` | Pembelian/Restock | id, user_id, product_id, product_name, sku, qty, price, supplier_id, supplier_name, customer_id, customer_name, purchase_date, notes |
| `sales` | Penjualan | id, user_id, product_id, product_name, sku, qty, price, subtotal, customer_id, customer_name, customer_type (pelanggan/mitra/umum), partner_id, sale_date, notes |

**Multi-tenancy**: Semua tabel utama punya `user_id` FK ke `users.id` (ON DELETE CASCADE)

---

## Frontend - Arsitektur Detail

### 1. Entry Point (`src/main.ts`)
```typescript
const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')
// Auth init di router guard (bukan di main.ts)
```

### 2. Router (`src/router/index.ts`)
- **Public routes**: `/login`, `/register` (meta: `{guest: true}`)
- **Protected routes**: Semua dibungkus `DefaultLayout` (meta: `{requiresAuth: true}`)
- **Navigation Guards**:
  - Jika `requiresAuth` & belum login → redirect `/login`
  - Jika `guest` & sudah login → redirect `/dashboard`
  - Auto-call `authStore.initAuth()` saat akses protected route

### 3. API Service (`src/services/api.ts`)
- Axios instance: `baseURL: '/api'` (proxied ke backend via Vite)
- **Auto-refresh interceptor**: Saat 401 & belum retry → call `/auth/refresh` dengan refreshToken dari localStorage → update accessToken → retry request original

### 4. Pinia Stores

#### `auth.ts` (`useAuthStore`)
```typescript
state: {
  user: User | null,
  accessToken: string | null,      // dari localStorage
  refreshToken: string | null,     // dari localStorage
  loading: boolean
}
getters: { isAuthenticated }
actions: {
  login(username, password),
  register(data),
  logout(),                        // call API + clear localStorage
  fetchMe(),                       // GET /auth/me
  initAuth()                       // set header + fetchMe jika token ada
}
```

#### `products.ts` (`useProductsStore`)
```typescript
state: { products: Product[], loading, initialized }
getters: { getProductById, totalStock, lowStockProducts }
actions: {
  fetchAll(params),                // GET /products?page&limit&search
  fetchForSelect(),                // GET /products?limit=1000 (untuk dropdown)
  updateStock(productId, delta),   // local update setelah purchase/sale
  updateProduct(product),
  addProduct(product),
  removeProduct(id),
  reset()
}
```

### 5. Reusable Components

#### `DataTable.vue` - Generic Table
Props: `columns: Column[]`, `rows: any[]`, `loading`, `pagination`, `searchValue`, `rowKey`
Features: Server-side pagination, search input (debounced via parent), custom slots per column, mobile card view, loading skeleton

#### `ModalForm.vue` - Base Modal
Props: `modelValue: boolean`, `title`, `width`
Emits: `update:modelValue`, `submit`
Handles: focus trap, body scroll lock, ESC to close, click outside

#### Entity Forms (extend ModalForm pattern)
- `CustomerForm.vue`, `PartnerForm.vue`, `SupplierForm.vue`: Simple forms dengan name, contact, phone, email, address + **SearchableSelect** untuk typeahead suggestions
- `ProductForm.vue`: Complex form dengan supplier select, harga beli/jual/mitra, bundle, stok
- `PackageForm.vue`: Dynamic items (product + qty), fetch products untuk dropdown
- `PurchaseForm.vue` / `SaleForm.vue`: Transaction forms dengan product search, auto-calc subtotal, customer/partner select

#### `SearchableSelect.vue` - Autocomplete Dropdown
Props: `options`, `modelValue`, `placeholder`, `searchable`, `labelKey`, `valueKey`
Features: Keyboard navigation, filtering, custom option rendering

### 6. Views (Pages)
| View | Description | Components Used |
|------|-------------|-----------------|
| `Dashboard.vue` | Stats cards, low stock, recent products | DataTable (inline), api calls |
| `Customers.vue` | CRUD pelanggan | DataTable, CustomerForm (ModalForm) |
| `Suppliers.vue` | CRUD pemasok | DataTable, SupplierForm |
| `Partners.vue` | CRUD mitra | DataTable, PartnerForm |
| `Products.vue` | CRUD produk + stok | DataTable, ProductForm, ProductsStore |
| `Purchases.vue` | CRUD pembelian + update stok | DataTable, PurchaseForm |
| `Sales.vue` | CRUD penjualan + update stok | DataTable, SaleForm |
| `Packages.vue` | CRUD paket + items | DataTable, PackageForm |
| `Finance.vue` | Laporan keuangan (sales + purchases) | Date range filter, summary cards, combined table |
| `Login.vue` / `Register.vue` | Auth pages | AuthStore |

---

## Alur Data & State Management

### Authentication Flow
```
1. User login → POST /auth/login
2. Backend: verify password → generate accessToken (15m) + refreshToken (7d)
3. Backend: store refreshToken hash di DB, set refreshToken cookie (httpOnly)
4. Frontend: simpan accessToken & refreshToken di localStorage + Pinia
5. Axios interceptor: set Authorization header = Bearer <accessToken>
6. Request ke protected API → middleware authMiddleware validasi token
7. Token expired (401) → interceptor auto-call POST /auth/refresh dengan refreshToken
8. Backend: verify refreshToken, cek DB tidak revoked → rotate (revoke old, issue new pair)
9. Frontend: update localStorage + retry request original
```

### Product Stock Updates (Real-time)
```
1. User create Purchase → POST /purchases
2. Backend: insert purchase + UPDATE products SET stock = stock + qty WHERE id = product_id
3. Frontend: on success → productsStore.updateStock(productId, +qty)
4. User create Sale → POST /sales
5. Backend: insert sale + UPDATE products SET stock = stock - qty WHERE id = product_id
6. Frontend: on success → productsStore.updateStock(productId, -qty)
5. Dashboard/Components reactive via productsStore.products (computed)
```

### Package Stock Calculation
- Package tidak punya stok sendiri
- `getPackageStock(package)` = `Math.min(...items.map(item => Math.floor(product.stock / item.qty)))`
- Ditampilkan di `Packages.vue` via computed

---

## Environment Variables

### Backend (`.env.local`)
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=budi
DB_PASSWORD=Budi@123
DB_NAME=tokoku
JWT_ACCESS_SECRET=<base64-secret-32-bytes>
JWT_REFRESH_SECRET=<base64-secret-32-bytes>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
NODE_ENV=development
```

### Frontend (Vite Proxy)
```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

---

## Development Commands

### Backend
```bash
cd backend
npm run dev      # Next.js dev server (port 3000)
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

### Frontend
```bash
cd frontend
npm run dev      # Vite dev server (port 5173)
npm run build    # TypeScript check + Vite build
npm run preview  # Preview production build
```

---

## Key Technical Decisions

1. **Next.js App Router** untuk API routes (bukan Express) - unified framework
2. **jose** bukan `jsonwebtoken` - Edge runtime compatible, modern API
3. **SHA256 hash** untuk refresh token storage - tidak simpan plaintext token di DB
4. **Refresh token rotation** - revoke old token saat refresh, prevent replay attacks
5. **Multi-tenancy via user_id** - semua data terisolasi per user
6. **Pinia stores** untuk client-side caching (products) - avoid refetch
7. **Vite proxy** `/api` → backend - no CORS issues di development
8. **Zod validation** di setiap endpoint - type-safe runtime validation
9. **SweetAlert2** untuk notifications - consistent UX
10. **TailwindCSS** (v3 frontend, v4 backend) - utility-first styling

---

## Security Considerations

- Password: bcrypt cost 12
- JWT: HS256, short access token (15m), long refresh token (7d) dengan rotation
- Refresh token: httpOnly cookie (backend) + localStorage (frontend untuk refresh call)
- CORS: whitelist origin hanya `localhost:5173`
- SQL: Parameterized queries (mysql2 `execute`/`query` dengan `?` placeholders)
- Role-based access: `requireRole()` middleware
- Input validation: Zod schemas di semua mutating endpoints

---

## Known Issues / TODOs

1. **Frontend**: `ProductForm.vue` panjang (500+ lines) - bisa dipecah jadi komponen kecil
2. **Backend**: Tidak ada rate limiting pada auth endpoints
3. **Database**: Tidak ada soft delete (hanya hard delete)
4. **Testing**: Belum ada unit/integration tests
5. **Docker**: Belum ada docker-compose untuk deployment
6. **Frontend**: `PurchaseForm` & `SaleForm` duplikasi logic - bisa extract ke composable
7. **Backend**: `transaction` helper di `db.ts` tapi tidak dipakai di semua endpoint yang butuh atomicity

---

## File Referensi Cepat

| File | Fungsi |
|------|--------|
| `backend/src/lib/db.ts` | DB connection & query helpers |
| `backend/src/lib/auth.ts` | JWT, bcrypt, token utils |
| `backend/src/middleware/auth.ts` | Auth & RBAC middleware |
| `backend/src/app/api/*/route.ts` | REST endpoints per resource |
| `frontend/src/services/api.ts` | Axios + auto-refresh interceptor |
| `frontend/src/stores/auth.ts` | Auth state management |
| `frontend/src/stores/products.ts` | Products cache & stock sync |
| `frontend/src/router/index.ts` | Routing + auth guards |
| `frontend/src/components/DataTable.vue` | Reusable table component |
| `frontend/src/components/forms/*.vue` | Entity forms |
| `tokoku_20260924-01.sql` | Full DB schema + seed data |