-- Penjualan paket: tautkan sale ke paket dan simpan snapshot komponen
-- untuk pengurangan/pengembalian stok yang akurat.

ALTER TABLE sales
  ADD COLUMN package_id INT(10) UNSIGNED NULL AFTER product_id,
  ADD KEY idx_package_id (package_id),
  ADD CONSTRAINT fk_sales_package FOREIGN KEY (package_id) REFERENCES packages (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id INT(10) UNSIGNED NOT NULL,
  product_id INT(10) UNSIGNED NULL,
  product_name VARCHAR(150) NOT NULL,
  qty INT(10) UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sale_items_sale_id (sale_id),
  KEY idx_sale_items_product_id (product_id),
  CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
