const pool = require("../../config/database");

async function create({ userId, tokenHash, expiresAt }) {
  const [result] = await pool.execute(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [userId, tokenHash, expiresAt]
  );
  return result.insertId;
}

async function findActiveByHash(tokenHash) {
  const [rows] = await pool.execute(
    `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
     FROM refresh_tokens
     WHERE token_hash = ? AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function revokeById(id) {
  const [result] = await pool.execute(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revoked_at IS NULL`,
    [id]
  );
  return result.affectedRows;
}

async function revokeAllForUser(userId, db = pool) {
  const [result] = await db.execute(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP`,
    [userId]
  );
  return result.affectedRows;
}

async function deleteExpired() {
  const [result] = await pool.execute(
    "DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP"
  );
  return result.affectedRows;
}

async function rotate(id, { userId, tokenHash, expiresAt }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
      [id, userId]
    );
    if (result.affectedRows !== 1) {
      await connection.rollback();
      return false;
    }
    await connection.execute(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [userId, tokenHash, expiresAt]
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { create, findActiveByHash, revokeById, revokeAllForUser, deleteExpired, rotate };
