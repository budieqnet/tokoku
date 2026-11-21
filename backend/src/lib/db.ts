import mysql from 'mysql2/promise';

const globalForPool = globalThis as unknown as { mysqlPool: mysql.Pool | undefined };

const pool = globalForPool.mysqlPool ?? mysql.createPool({
  host: (globalThis as any).process?.env?.DB_HOST || 'localhost',
  port: parseInt((globalThis as any).process?.env?.DB_PORT || '3306'),
  user: (globalThis as any).process?.env?.DB_USER || 'budi',
  password: (globalThis as any).process?.env?.DB_PASSWORD || 'Budi@123',
  database: (globalThis as any).process?.env?.DB_NAME || 'tokoku',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
});

if ((globalThis as any).process?.env?.NODE_ENV !== 'production') globalForPool.mysqlPool = pool;

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

export async function transaction<T>(callback: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export default pool;