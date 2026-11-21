import type { PoolConnection } from 'mysql2/promise';

export interface SaleStockItem {
  product_id: number;
  product_name: string;
  qty: number;
}

export interface PackageStockData {
  id: number;
  name: string;
  price: number;
  items: SaleStockItem[];
}

export class SaleValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'SaleValidationError';
    this.field = field;
  }
}

interface PackageRow {
  id: number;
  name: string;
  price: number | string;
}

interface PackageItemRow {
  product_id: number;
  product_name: string;
  qty: number | string;
}

/**
 * Load package composition and compute the stock required for `multiplier`
 * packages (multiplier = sale qty).
 */
export async function getPackageStockData(
  conn: PoolConnection,
  packageId: number,
  userId: number,
  multiplier: number
): Promise<PackageStockData> {
  const [packageRows] = await conn.execute(
    'SELECT id, name, price FROM packages WHERE id = ? AND user_id = ?',
    [packageId, userId]
  );
  const pkg = (packageRows as PackageRow[])[0];

  if (!pkg) {
    throw new SaleValidationError('package_id', 'Paket tidak ditemukan');
  }

  const [itemRows] = await conn.execute(
    `SELECT pi.product_id, pi.qty, p.name AS product_name
     FROM package_items pi
     JOIN products p ON p.id = pi.product_id AND p.user_id = ?
     WHERE pi.package_id = ?
     ORDER BY pi.product_id`,
    [userId, packageId]
  );
  const rows = itemRows as PackageItemRow[];

  if (rows.length === 0) {
    throw new SaleValidationError('package_id', 'Paket tidak memiliki produk');
  }

  return {
    id: pkg.id,
    name: pkg.name,
    price: Number(pkg.price),
    items: rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      qty: Number(row.qty) * multiplier,
    })),
  };
}

/**
 * Apply a stock delta for every item. direction = -1 deducts stock (sale),
 * direction = 1 restores stock (edit/delete).
 * Products are locked with FOR UPDATE inside the caller's transaction.
 */
export async function applyStockDelta(
  conn: PoolConnection,
  userId: number,
  items: SaleStockItem[],
  direction: -1 | 1
): Promise<void> {
  const sorted = [...items].sort((a, b) => a.product_id - b.product_id);

  for (const item of sorted) {
    const [productRows] = await conn.execute(
      'SELECT stock, name FROM products WHERE id = ? AND user_id = ? FOR UPDATE',
      [item.product_id, userId]
    );
    const product = (productRows as Array<{ stock: number | string; name: string }>)[0];

    if (!product) {
      throw new SaleValidationError('product_id', `Produk ${item.product_name} tidak ditemukan`);
    }

    if (direction === -1 && Number(product.stock) < item.qty) {
      throw new SaleValidationError(
        'qty',
        `Stok ${product.name} tidak mencukupi. Stok tersedia: ${Number(product.stock)}, dibutuhkan: ${item.qty}`
      );
    }

    await conn.execute(
      'UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?',
      [direction * item.qty, item.product_id, userId]
    );
  }
}

export async function replaceSaleItems(
  conn: PoolConnection,
  saleId: number,
  items: SaleStockItem[]
): Promise<void> {
  await conn.execute('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);

  for (const item of items) {
    await conn.execute(
      'INSERT INTO sale_items (sale_id, product_id, product_name, qty) VALUES (?, ?, ?, ?)',
      [saleId, item.product_id, item.product_name, item.qty]
    );
  }
}

/**
 * Read the stock items that belong to an existing sale. New sales store their
 * components in sale_items; older product sales fall back to sales.product_id.
 */
export async function getSaleStockItems(
  conn: PoolConnection,
  sale: { id: number; product_id: number | null; product_name: string; qty: number }
): Promise<SaleStockItem[]> {
  const [rows] = await conn.execute(
    'SELECT product_id, product_name, qty FROM sale_items WHERE sale_id = ? ORDER BY product_id',
    [sale.id]
  );
  const items = rows as Array<{ product_id: number | null; product_name: string; qty: number | string }>;

  if (items.length > 0) {
    return items
      .filter((item) => item.product_id !== null)
      .map((item) => ({
        product_id: item.product_id as number,
        product_name: item.product_name,
        qty: Number(item.qty),
      }));
  }

  if (sale.product_id) {
    return [{
      product_id: sale.product_id,
      product_name: sale.product_name,
      qty: Number(sale.qty),
    }];
  }

  return [];
}
