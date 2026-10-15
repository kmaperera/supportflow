const pool = require('../../config/database');

async function lockUser(userId, db) {
  const [rows] = await db.execute('SELECT id, email, first_name, is_active, password_hash FROM users WHERE id = ? FOR UPDATE', [userId]);
  return rows[0] || null;
}
async function invalidateForUser(userId, db = pool) {
  await db.execute('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [userId]);
}
async function create(userId, tokenHash, minutes, db) {
  const [result] = await db.execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))', [userId, tokenHash, minutes]);
  return result.insertId;
}
async function findUsable(tokenHash, db = pool, lock = false) {
  const [rows] = await db.execute('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()' + (lock ? ' FOR UPDATE' : ''), [tokenHash]);
  return rows[0] || null;
}
async function invalidateById(id, db = pool) {
  await db.execute('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL', [id]);
}
module.exports = { lockUser, invalidateForUser, create, findUsable, invalidateById };
