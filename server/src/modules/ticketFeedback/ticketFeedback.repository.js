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

// Satisfaction aggregation is introduced in Phase 11.17.
module.exports = { findByTicketId, create, updateByTicketId };
