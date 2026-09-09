const pool = require("../../config/database");

async function findByTicketId(ticketId, db = pool) {
  const [rows] = await db.query(
    `SELECT id, ticket_id, user_id, rating, comment, created_at, updated_at
     FROM ticket_feedback WHERE ticket_id = ? LIMIT 1`,
    [ticketId]
  );
  return rows[0] || null;
}

async function create({ ticketId, userId, rating, comment = null }, db = pool) {
  const [result] = await db.query(
    `INSERT INTO ticket_feedback (ticket_id, user_id, rating, comment)
     VALUES (?, ?, ?, ?)`,
    [ticketId, userId, rating, comment]
  );
  return result.insertId;
}

async function updateByTicketId({ ticketId, rating, comment = null }, db = pool) {
  const [result] = await db.query(
    "UPDATE ticket_feedback SET rating = ?, comment = ? WHERE ticket_id = ?",
    [rating, comment, ticketId]
  );
  return result.affectedRows;
}

async function getSatisfactionSummary(db = pool) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total_ratings, AVG(rating) AS average_rating,
       COALESCE(SUM(rating >= 4), 0) AS satisfied_ratings,
       COALESCE(SUM(rating = 5), 0) AS rating_5,
       COALESCE(SUM(rating = 4), 0) AS rating_4,
       COALESCE(SUM(rating = 3), 0) AS rating_3,
       COALESCE(SUM(rating = 2), 0) AS rating_2,
       COALESCE(SUM(rating = 1), 0) AS rating_1
     FROM ticket_feedback`
  );
  return rows[0];
}

module.exports = { findByTicketId, create, updateByTicketId, getSatisfactionSummary };
