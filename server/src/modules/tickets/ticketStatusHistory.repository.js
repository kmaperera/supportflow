const pool = require("../../config/database");

async function createHistory({ ticketId, fromStatus, toStatus, changedBy }, db = pool) {
  const [result] = await db.query(
    "INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)",
    [ticketId, fromStatus, toStatus, changedBy]
  );
  return result.insertId;
}

async function findByTicketId(ticketId, db = pool) {
  const [rows] = await db.query(
    "SELECT h.id, h.ticket_id, h.from_status, h.to_status, h.changed_by, h.changed_at, " +
    "actor.first_name AS changed_by_first_name, actor.last_name AS changed_by_last_name, " +
    "actor.email AS changed_by_email, actor.role AS changed_by_role " +
    "FROM ticket_status_history AS h INNER JOIN users AS actor ON actor.id = h.changed_by " +
    "WHERE h.ticket_id = ? ORDER BY h.changed_at ASC, h.id ASC",
    [ticketId]
  );
  return rows;
}

module.exports = { createHistory, findByTicketId };
