const pool = require("../../config/database");

const ARTICLE_SELECT = `
  SELECT a.id, a.category_id, c.name AS category_name, c.is_active AS category_is_active,
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

function listVisibility({ status, activeCategoryOnly, search, categoryId } = {}) {
  const clauses = [];
  const values = [];
  if (status !== undefined) { clauses.push("a.status = ?"); values.push(status); }
  if (activeCategoryOnly === true) clauses.push("c.is_active = TRUE");
  if (search) {
    clauses.push("(a.title LIKE ? OR a.content LIKE ?)");
    values.push(`%${search}%`, `%${search}%`);
  }
  if (categoryId !== undefined) { clauses.push("a.category_id = ?"); values.push(categoryId); }
  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", values };
}

const ARTICLE_LIST_FROM = `FROM knowledge_base_articles AS a
  INNER JOIN knowledge_base_categories AS c ON c.id = a.category_id
  INNER JOIN users AS author ON author.id = a.created_by`;

async function findAll({ limit = 20, offset = 0, ...filters } = {}, db = pool) {
  const { where, values } = listVisibility(filters);
  const [rows] = await db.query(
    `SELECT a.id, a.category_id, c.name AS category_name,
       a.title, a.slug, a.status, a.view_count, a.created_by,
       a.published_at, a.created_at, a.updated_at
     ${ARTICLE_LIST_FROM}${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return rows;
}

async function countAll(filters = {}, db = pool) {
  const { where, values } = listVisibility(filters);
  const [rows] = await db.query(`SELECT COUNT(*) AS total ${ARTICLE_LIST_FROM}${where}`, values);
  return Number(rows[0].total);
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

async function findSuggestedArticles({ terms, limit = 5 }, db = pool) {
  if (!Array.isArray(terms) || terms.length > 8 || terms.some(term => typeof term !== "string" || !term) ||
      !Number.isInteger(limit) || limit < 1 || limit > 10) throw new TypeError("Invalid article suggestion options");
  if (!terms.length) return [];
  const score = terms.map(() => "(CASE WHEN a.title LIKE ? THEN 3 ELSE 0 END + CASE WHEN a.content LIKE ? THEN 1 ELSE 0 END)").join(" + ");
  const values = terms.flatMap(term => [`%${term}%`, `%${term}%`]);
  const [rows] = await db.query(
    `SELECT a.id, a.category_id, c.name AS category_name, a.title, a.slug, a.view_count, a.published_at,
       (${score}) AS relevance_score
     FROM knowledge_base_articles AS a
     INNER JOIN knowledge_base_categories AS c ON c.id = a.category_id
     WHERE a.status = 'PUBLISHED' AND c.is_active = TRUE
     HAVING relevance_score > 0
     ORDER BY relevance_score DESC, a.view_count DESC, a.published_at DESC, a.id DESC LIMIT ?`,
    [...values, limit]
  );
  return rows;
}

module.exports = {
  findById, findBySlug, create, updateById, updateStatus,
  findAll, countAll, findByStatus, findByCategoryId, incrementViewCount, findSuggestedArticles,
};
