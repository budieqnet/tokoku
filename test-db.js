import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'budi',
  password: 'Budi@123',
  database: 'tokoku',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
});

async function testRegister() {
  console.log('Testing register-like operations...');
  
  try {
    // Simulate register: check user exists
    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ? OR email = ?', ['testdebug', 'testdebug@test.com']);
    console.log('Existing user check:', existing.length);
    
    if (existing.length > 0) {
      console.log('User already exists');
      return;
    }
    
    // Insert user
    const [result] = await pool.execute(
      `INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, 'user')`,
      ['testdebug', 'testdebug@test.com', '$2b$12$testhash', 'Test Debug']
    );
    console.log('User inserted, insertId:', result.insertId);
    
    // Get created user
    const [user] = await pool.execute('SELECT id, username, email, full_name, avatar_url, role, created_at FROM users WHERE id = ?', [result.insertId]);
    console.log('User fetched:', user[0]);
    
    // Insert refresh token
    const [tokenResult] = await pool.execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, SHA2(?, 256), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [result.insertId, 'testrefreshtoken']
    );
    console.log('Refresh token inserted, insertId:', tokenResult.insertId);
    
    console.log('Register simulation completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

async function testLogin() {
  console.log('\nTesting login-like operations...');
  
  try {
    // Simulate login: get user
    const [user] = await pool.execute('SELECT id, username, email, password_hash, full_name, avatar_url, role, is_active, created_at FROM users WHERE username = ?', ['testdebug']);
    console.log('User fetched:', user[0] ? 'found' : 'not found');
    
    if (user.length === 0) {
      console.log('User not found');
      return;
    }
    
    // Update last_login_at
    const [updateResult] = await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user[0].id]);
    console.log('Last login updated:', updateResult.affectedRows);
    
    // Insert refresh token
    const [tokenResult] = await pool.execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, SHA2(?, 256), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [user[0].id, 'testrefreshtoken2']
    );
    console.log('Refresh token inserted, insertId:', tokenResult.insertId);
    
    console.log('Login simulation completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

async function main() {
  await testRegister();
  // Create new pool for login test
  const pool2 = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'budi',
    password: 'Budi@123',
    database: 'tokoku',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    dateStrings: true,
  });
  
  // Replace pool for login test
  global.testPool = pool2;
  await testLogin();
}

main();