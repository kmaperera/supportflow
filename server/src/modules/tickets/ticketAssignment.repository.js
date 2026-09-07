const pool = require("../../config/database");

async function createAssignment(data, db = pool) {
  const { ticketId, technicianId, assignedBy, assignmentType } = data;
  const [result] = await db.query(
    `INSERT INTO ticket_assignments
      (ticket_id, technician_id, assigned_by, assignment_type, unassigned_at)
     VALUES (?, ?, ?, ?, NULL)`,
    [ticketId, technicianId, assignedBy, assignmentType]
  );
  return result.insertId;
}

async function closeActiveAssignment(ticketId, db = pool) {
  const [result] = await db.query(
    `UPDATE ticket_assignments SET unassigned_at = CURRENT_TIMESTAMP
     WHERE ticket_id = ? AND unassigned_at IS NULL`,
    [ticketId]
  );
  return result.affectedRows;
}

async function findActiveByTicketId(ticketId, db = pool) {
  const [rows] = await db.query(
    `SELECT id, ticket_id, technician_id, assigned_by, assignment_type, assigned_at, unassigned_at
     FROM ticket_assignments WHERE ticket_id = ? AND unassigned_at IS NULL
     ORDER BY assigned_at DESC, id DESC LIMIT 1`,
    [ticketId]
  );
  return rows[0] || null;
}

async function findHistoryByTicketId(ticketId, db = pool) {
  const [rows] = await db.query(
    `SELECT a.id, a.ticket_id, a.technician_id, a.assigned_by,
       a.assignment_type, a.assigned_at, a.unassigned_at,
       technician.first_name AS technician_first_name,
       technician.last_name AS technician_last_name,
       technician.email AS technician_email,
       assigner.first_name AS assigner_first_name,
       assigner.last_name AS assigner_last_name,
       assigner.email AS assigner_email
     FROM ticket_assignments AS a
     INNER JOIN users AS technician ON technician.id = a.technician_id
     INNER JOIN users AS assigner ON assigner.id = a.assigned_by
     WHERE a.ticket_id = ?
     ORDER BY a.assigned_at DESC, a.id DESC`,
    [ticketId]
  );
  return rows;
}

module.exports = {
  createAssignment, closeActiveAssignment, findActiveByTicketId, findHistoryByTicketId,
};
