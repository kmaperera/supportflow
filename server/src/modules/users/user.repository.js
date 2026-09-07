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

async function findById(id, db = pool) {
  const [rows] = await db.execute(
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

const MANAGEMENT_FIELDS = "id, first_name, last_name, email, phone, role, department, profile_image_url, is_active, must_change_password, last_login_at, created_at, updated_at";
const SORT_COLUMNS = ["first_name", "last_name", "email", "role", "department", "created_at", "updated_at"];
const PROFILE_COLUMNS = {
  firstName: "first_name", lastName: "last_name", email: "email",
  phone: "phone", department: "department", profileImageUrl: "profile_image_url",
};

function buildFilters(options) {
  const clauses = [];
  const values = [];
  if (options.search) {
    clauses.push("(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)");
    values.push(...Array(3).fill(`%${options.search}%`));
  }
  for (const [key, column] of [["role", "role"], ["department", "department"], ["isActive", "is_active"]]) {
    if (options[key] !== undefined) {
      clauses.push(`${column} = ?`);
      values.push(options[key]);
    }
  }
  return { where: clauses.length ? " WHERE " + clauses.join(" AND ") : "", values };
}

async function findAll(options = {}) {
  const { where, values } = buildFilters(options);
  const sortBy = options.sortBy || "created_at";
  const order = (options.order || "DESC").toUpperCase();
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  if (!SORT_COLUMNS.includes(sortBy) || !["ASC", "DESC"].includes(order) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError("Invalid user listing options");
  }
  const [rows] = await pool.execute(
    `SELECT ${MANAGEMENT_FIELDS} FROM users${where} ORDER BY ${sortBy} ${order}, id ${order} LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return rows;
}

async function countAll(options = {}) {
  const { where, values } = buildFilters(options);
  const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM users${where}`, values);
  return Number(rows[0].total);
}

async function updateDetails(id, userData) {
  const entries = Object.entries(userData);
  if (!entries.length || entries.some(([key]) => !Object.hasOwn(PROFILE_COLUMNS, key))) {
    throw new TypeError("Only basic profile fields may be updated");
  }
  const assignments = entries.map(([key]) => `${PROFILE_COLUMNS[key]} = ?`).join(", ");
  const [result] = await pool.execute(
    `UPDATE users SET ${assignments} WHERE id = ?`,
    [...entries.map(([, value]) => value), id]
  );
  return result.affectedRows;
}

module.exports = {
  findAll, countAll, updateDetails,
  findByEmail,
  findById,
  create,
  updateLastLogin,
  updatePassword,
  updateStatus,
  updateRole,
};




