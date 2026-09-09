const pool = require("../../config/database");

const ARTICLE_SELECT = `
  SELECT a.id, a.category_id, c.name AS category_name,
    a.title, a.slug, a.content, a.status, a.view_count, a.created_by,
    author.first_name AS author_first_name, author.last_name AS author_last_name,
    a.published_at, a.created_at, a.updated_at
  FROM knowledge_base_articles AS a
  INNER JOIN knowledge_base_categories AS c ON c.id = a.category_id
  INNER JOIN users AS author ON author.id = a.created_by
`;

async function findById(articleId, db = pool) {
  const [rows] = await db.query(`${ARTICLE_SELECT} WHERE a.id = ? LIMIT 1`, [articleId]);
  return rows[0] || null;
}

async function findBySlug(slug, db = pool) {
  const [rows] = await db.query(`${ARTICLE_SELECT} WHERE a.slug = ? LIMIT 1`, [slug]);
  return rows[0] || null;
}

async function create({ categoryId, title, slug, content, createdBy }, db = pool) {
  const [result] = await db.query(
    `INSERT INTO knowledge_base_articles (category_id, title, slug, content, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [categoryId, title, slug, content, createdBy]
  );
  return result.insertId;
}

async function updateById(articleId, { categoryId, title, slug, content }, db = pool) {
  const [result] = await db.query(
    `UPDATE knowledge_base_articles SET category_id = ?, title = ?, slug = ?, content = ?
     WHERE id = ?`,
    [categoryId, title, slug, content, articleId]
  );
  return result.affectedRows;
}

async function updateStatus(articleId, status, publishedAt, db = pool) {
  const [result] = await db.query(
    "UPDATE knowledge_base_articles SET status = ?, published_at = ? WHERE id = ?",
    [status, publishedAt, articleId]
  );
  return result.affectedRows;
}

async function findAll({ limit = 20, offset = 0 } = {}, db = pool) {
  const [rows] = await db.query(
    `${ARTICLE_SELECT} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

async function findByStatus(status, db = pool) {
  const [rows] = await db.query(
    `${ARTICLE_SELECT} WHERE a.status = ? ORDER BY a.created_at DESC, a.id DESC`,
    [status]
  );
  return rows;
}

async function findByCategoryId(categoryId, db = pool) {
  const [rows] = await db.query(
    `${ARTICLE_SELECT} WHERE a.category_id = ? ORDER BY a.created_at DESC, a.id DESC`,
    [categoryId]
  );
  return rows;
}

async function incrementViewCount(articleId, db = pool) {
  const [result] = await db.query(
    "UPDATE knowledge_base_articles SET view_count = view_count + 1 WHERE id = ?",
    [articleId]
  );
  return result.affectedRows;
}

module.exports = {
  findById, findBySlug, create, updateById, updateStatus,
  findAll, findByStatus, findByCategoryId, incrementViewCount,
};
