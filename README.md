# Tokoku — Aplikasi Manajemen Toko

**Tokoku** adalah aplikasi manajemen toko full-stack (inventory, sales, purchases, customers, suppliers, partners, packages) dibangun dengan arsitektur **Full-Stack TypeScript**.

---

## 🏗️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Backend** | Next.js 16 (App Router), MySQL (mysql2), JWT (jose), Zod validation |
| **Frontend** | Vue 3, Vite, Pinia, Vue Router, Axios, TailwindCSS 3 |
| **Database** | MySQL (`tokoku` database) |
| **Auth** | JWT (HS256) — Access Token 15m + Refresh Token 7d (rotation) |
| **Styling** | TailwindCSS (utility-first) |
| **Notifications** | SweetAlert2 |

---

## ✨ Fitur Utama

| Modul | Fungsi |
|-------|--------|
| **Authentication** | Login, Register, Refresh Token (auto), Logout, Role-based access (admin/manager/staff/kasir) |
| **Customers** | CRUD pelanggan (nama, telepon, email, alamat) |
| **Suppliers** | CRUD pemasok (nama, kontak, telepon, email, alamat) |
| **Partners** | CRUD mitra/reseller (nama, kontak, telepon, email, alamat) |
| **Products** | CRUD produk (SKU, harga beli/jual/mitra, bundle, stok, supplier) |
| **Packages** | CRUD paket/bundle produk (dynamic items, auto stock calculation) |
| **Purchases** | CRUD pembelian/restock + auto update stok produk |
| **Sales** | CRUD penjualan + auto update stok produk, support customer/partner |
| **Finance** | Laporan keuangan gabungan (sales + purchases) dengan filter tanggal |
| **Dashboard** | Stats cards, low stock alert, recent products |

---

## 📁 Struktur Proyek

```
tokoku/
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
│   │   │   └── middleware.ts  # CORS handling
│   │   └── middleware.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── .env.local
│
├── frontend/                   # Vue 3 + Vite (port 5173)
│   ├── src/
│   │   ├── components/
│   │   │   ├── DataTable.vue  # Reusable table (pagination, search, slots)
│   │   │   ├── forms/         # Form components (ModalForm + entity forms)
│   │   │   └── HelloWorld.vue
│   │   ├── layouts/
│   │   │   └── DefaultLayout.vue  # Sidebar navigation + logout
│   │   ├── router/
│   │   │   └── index.ts       # Vue Router + auth guards
│   │   ├── services/
│   │   │   └── api.ts         # Axios instance + auto-refresh interceptor
│   │   ├── stores/
│   │   │   ├── auth.ts        # Pinia: login, register, logout, token management
│   │   │   └── products.ts    # Pinia: products cache, stock updates
│   │   ├── utils/
│   │   │   └── alert.ts       # SweetAlert2 wrapper
│   │   ├── views/             # Page components (route targets)
│   │   │   ├── Dashboard.vue
│   │   │   ├── Login.vue / Register.vue
│   │   │   ├── Customers.vue / CustomerForm.vue
│   │   │   ├── Suppliers.vue / SupplierForm.vue
│   │   │   ├── Partners.vue / PartnerForm.vue
│   │   │   ├── Products.vue / ProductForm.vue
│   │   │   ├── Purchases.vue
│   │   │   ├── Sales.vue
│   │   │   ├── Packages.vue / PackageForm.vue
│   │   │   └── Finance.vue
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── style.css
│   ├── package.json
│   ├── vite.config.ts         # Proxy /api -> http://localhost:3000
│   └── tailwind.config.js
│
├── db/
│   └── tokoku.sql             # Database schema + seed data
│
├── security-audit/            # Dokumentasi security audit
│
├── PROJECT_DOCUMENTATION.md   # Dokumentasi teknis lengkap
└── README.md                  # (file ini)
```

---

## 🗄️ Database Schema (MySQL)

| Tabel | Deskripsi | Key Columns |
|-------|-----------|-------------|
| `users` | Pengguna sistem | id, username, email, password_hash, full_name, role, is_active |
| `refresh_tokens` | Token refresh storage | id, user_id, token_hash (SHA256), expires_at, revoked_at |
| `customers` | Pelanggan | id, user_id, name, phone, email, address |
| `suppliers` | Pemasok | id, user_id, name, contact, phone, email, address |
| `partners` | Mitra/Reseller | id, user_id, name, contact, phone, email, address |
| `products` | Produk/Barang | id, user_id, name, sku, buy_price, price, partner_price, bundle_qty, bundle_price, stock, supplier_id, supplier_name |
| `packages` | Paket/Bundle produk | id, user_id, name, price |
| `package_items` | Items dalam paket | id, package_id, product_id, qty |
| `purchases` | Pembelian/Restock | id, user_id, product_id, product_name, sku, qty, price, supplier_id, supplier_name, customer_id, customer_name, purchase_date, notes |
| `sales` | Penjualan | id, user_id, product_id, product_name, sku, qty, price, subtotal, customer_id, customer_name, customer_type, partner_id, sale_date, notes |

> **Multi-tenancy**: Semua tabel utama punya `user_id` FK ke `users.id` (ON DELETE CASCADE) — data terisolasi per user.

---

## 🔐 Authentication Flow

```
1. User login → POST /api/auth/login
2. Backend: verify password → generate accessToken (15m) + refreshToken (7d)
3. Backend: store refreshToken hash (SHA256) di DB, set refreshToken cookie (httpOnly)
4. Frontend: simpan accessToken & refreshToken di localStorage + Pinia
5. Axios interceptor: set Authorization header = Bearer <accessToken>
6. Request ke protected API → middleware authMiddleware validasi token
7. Token expired (401) → interceptor auto-call POST /api/auth/refresh dengan refreshToken
8. Backend: verify refreshToken, cek DB tidak revoked → rotate (revoke old, issue new pair)
9. Frontend: update localStorage + retry request original
```

---

## 📦 Product Stock Updates (Real-time)

```
Purchase Created:
1. User create Purchase → POST /api/purchases
2. Backend: insert purchase + UPDATE products SET stock = stock + qty WHERE id = product_id
3. Frontend: on success → productsStore.updateStock(productId, +qty)

Sale Created:
1. User create Sale → POST /api/sales
2. Backend: insert sale + UPDATE products SET stock = stock - qty WHERE id = product_id
3. Frontend: on success → productsStore.updateStock(productId, -qty)
```

**Package Stock Calculation:**
- Package tidak punya stok sendiri
- `getPackageStock(package)` = `Math.min(...items.map(item => Math.floor(product.stock / item.qty)))`

---

## ⚙️ Environment Variables

### Backend (`backend/.env.local`)
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
// frontend/vite.config.ts
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

## 🚀 Cara Menjalankan

### Prasyarat
- Node.js 18+
- MySQL 8.0+ (database `tokoku` sudah dibuat)
- User MySQL `budi` dengan akses penuh

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/budieqnet/tokoku.git
cd tokoku

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Setup Database
```bash
# Import schema + seed data
mysql -u budi -p tokoku < db/tokoku.sql
```

### 3. Konfigurasi Environment
```bash
# Backend
cd backend
cp .env.local.example .env.local  # edit sesuai konfigurasi MySQL & JWT secret
```

### 4. Jalankan Development Servers

**Terminal 1 - Backend (port 3000):**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend (port 5173):**
```bash
cd frontend
npm run dev
```

### 5. Akses Aplikasi
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000/api

---

## 📝 Development Commands

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

## 🔑 Key Technical Decisions

1. **Next.js App Router** untuk API routes (bukan Express) — unified framework
2. **jose** bukan `jsonwebtoken` — Edge runtime compatible, modern API
3. **SHA256 hash** untuk refresh token storage — tidak simpan plaintext token di DB
4. **Refresh token rotation** — revoke old token saat refresh, prevent replay attacks
5. **Multi-tenancy via user_id** — semua data terisolasi per user
5. **Pinia stores** untuk client-side caching (products) — avoid refetch
6. **Vite proxy** `/api` → backend — no CORS issues di development
7. **Zod validation** di setiap endpoint — type-safe runtime validation
8. **SweetAlert2** untuk notifications — consistent UX
9. **TailwindCSS** (v3 frontend, v4 backend) — utility-first styling

---

## 🛡️ Security Considerations

- **Password**: bcrypt cost 12
- **JWT**: HS256, short access token (15m), long refresh token (7d) dengan rotation
- **Refresh token**: httpOnly cookie (backend) + localStorage (frontend untuk refresh call)
- **CORS**: whitelist origin hanya `localhost:5173`
- **SQL**: Parameterized queries (mysql2 `execute`/`query` dengan `?` placeholders)
- **Role-based access**: `requireRole()` middleware (admin/manager/staff/kasir)

---

## 📄 License

Proyek ini open-source di bawah lisensi **MIT**. Silakan gunakan, modifikasi, dan distribusikan sesuai kebutuhan.

---

**Dibangun dengan ❤️ menggunakan Next.js + Vue 3 + TypeScript**
