const pool = require("../../config/database");

const CATEGORY_SELECT = `
  SELECT id, name, description, is_active, created_at, updated_at
  FROM knowledge_base_categories
`;

async function findAll(db = pool) {
  const [rows] = await db.query(`${CATEGORY_SELECT} ORDER BY name ASC`);
  return rows;
}

async function findById(categoryId, db = pool) {
  const [rows] = await db.query(`${CATEGORY_SELECT} WHERE id = ? LIMIT 1`, [categoryId]);
  return rows[0] || null;
}

async function findByName(name, db = pool) {
  const [rows] = await db.query(`${CATEGORY_SELECT} WHERE name = ? LIMIT 1`, [name]);
  return rows[0] || null;
}

async function create({ name, description = null }, db = pool) {
  const [result] = await db.query(
    "INSERT INTO knowledge_base_categories (name, description) VALUES (?, ?)",
    [name, description]
  );
  return result.insertId;
}

async function updateById(categoryId, { name, description = null }, db = pool) {
  const [result] = await db.query(
    "UPDATE knowledge_base_categories SET name = ?, description = ? WHERE id = ?",
    [name, description, categoryId]
  );
  return result.affectedRows;
}

async function setActiveStatus(categoryId, isActive, db = pool) {
  const [result] = await db.query(
    "UPDATE knowledge_base_categories SET is_active = ? WHERE id = ?",
    [isActive, categoryId]
  );
  return result.affectedRows;
}

async function findActive(db = pool) {
  const [rows] = await db.query(`${CATEGORY_SELECT} WHERE is_active = TRUE ORDER BY name ASC`);
  return rows;
}

module.exports = { findAll, findById, findByName, create, updateById, setActiveStatus, findActive };
