const pool = require("../../config/database");

const USER_FIELDS = `
  id, first_name, last_name, email, password_hash, phone, role,
  department, profile_image_url, is_active, must_change_password,
  last_login_at, created_at, updated_at
`;

async function findByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT ${USER_FIELDS} FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${USER_FIELDS} FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function create(userData) {
  const {
    firstName,
    lastName,
    email,
    passwordHash,
    phone = null,
    role = "EMPLOYEE",
    department = null,
    profileImageUrl = null,
    isActive = true,
    mustChangePassword = true,
  } = userData;

  const [result] = await pool.execute(
    `INSERT INTO users (
      first_name, last_name, email, password_hash, phone, role,
      department, profile_image_url, is_active, must_change_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      firstName, lastName, email, passwordHash, phone, role,
      department, profileImageUrl, isActive, mustChangePassword,
    ]
  );
  return Number(result.insertId);
}

async function updateLastLogin(id) {
  const [result] = await pool.execute(
    "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
    [id]
  );
  return result.affectedRows;
}

async function updatePassword(id, passwordHash) {
  const [result] = await pool.execute(
    "UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?",
    [passwordHash, id]
  );
  return result.affectedRows;
}

async function updateStatus(id, isActive) {
  const [result] = await pool.execute(
    "UPDATE users SET is_active = ? WHERE id = ?",
    [isActive, id]
  );
  return result.affectedRows;
}

async function updateRole(id, role) {
  const [result] = await pool.execute(
    "UPDATE users SET role = ? WHERE id = ?",
    [role, id]
  );
  return result.affectedRows;
}

module.exports = {
  findByEmail,
  findById,
  create,
  updateLastLogin,
  updatePassword,
  updateStatus,
  updateRole,
};

