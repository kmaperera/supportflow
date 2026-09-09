const pool = require("../../config/database");

const FEEDBACK_SELECT = `
  SELECT id, article_id, user_id, is_helpful, created_at, updated_at
  FROM article_feedback
`;

async function findByArticleAndUser(articleId, userId, db = pool) {
  const [rows] = await db.query(
    `${FEEDBACK_SELECT} WHERE article_id = ? AND user_id = ? LIMIT 1`,
    [articleId, userId]
  );
  return rows[0] || null;
}

async function create({ articleId, userId, isHelpful }, db = pool) {
  const [result] = await db.query(
    "INSERT INTO article_feedback (article_id, user_id, is_helpful) VALUES (?, ?, ?)",
    [articleId, userId, isHelpful]
  );
  return result.insertId;
}

async function updateByArticleAndUser(articleId, userId, isHelpful, db = pool) {
  const [result] = await db.query(
    "UPDATE article_feedback SET is_helpful = ? WHERE article_id = ? AND user_id = ?",
    [isHelpful, articleId, userId]
  );
  return result.affectedRows;
}

async function getSummaryByArticleId(articleId, db = pool) {
  const [rows] = await db.query(
    `SELECT COUNT(CASE WHEN is_helpful = TRUE THEN 1 END) AS helpful_count,
       COUNT(CASE WHEN is_helpful = FALSE THEN 1 END) AS not_helpful_count,
       COUNT(*) AS total_feedback
     FROM article_feedback WHERE article_id = ?`,
    [articleId]
  );
  return rows[0];
}

module.exports = { findByArticleAndUser, create, updateByArticleAndUser, getSummaryByArticleId };
