const pool = require("../../config/database");

async function getEmployeeSummary(userId, db = pool) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total_tickets,
       COALESCE(SUM(status = 'OPEN'), 0) AS open_tickets,
       COALESCE(SUM(status = 'ASSIGNED'), 0) AS assigned_tickets,
       COALESCE(SUM(status = 'IN_PROGRESS'), 0) AS in_progress_tickets,
       COALESCE(SUM(status = 'WAITING_FOR_USER'), 0) AS waiting_for_user_tickets,
       COALESCE(SUM(status = 'RESOLVED'), 0) AS resolved_tickets,
       COALESCE(SUM(status = 'CLOSED'), 0) AS closed_tickets,
       COALESCE(SUM(status = 'REOPENED'), 0) AS reopened_tickets,
       COALESCE(SUM(status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED')), 0) AS active_tickets
     FROM tickets WHERE created_by = ?`,
    [userId]
  );
  return rows[0];
}

async function getTechnicianSummary(technicianId, db = pool) {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(status = 'ASSIGNED'), 0) AS assigned_tickets,
       COALESCE(SUM(status = 'IN_PROGRESS'), 0) AS in_progress_tickets,
       COALESCE(SUM(status = 'WAITING_FOR_USER'), 0) AS waiting_for_user_tickets,
       COALESCE(SUM(status = 'REOPENED'), 0) AS reopened_tickets,
       COALESCE(SUM(status = 'RESOLVED'), 0) AS resolved_tickets,
       COALESCE(SUM(status IN ('ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED')), 0) AS active_assigned_tickets
     FROM tickets WHERE assigned_to = ?`,
    [technicianId]
  );
  return rows[0];
}

async function countUnassignedQueue(db = pool) {
  // The queue's assignment=unassigned filter has no implicit status restriction.
  const [rows] = await db.query("SELECT COUNT(*) AS total FROM tickets WHERE assigned_to IS NULL");
  return Number(rows[0].total);
}

module.exports = { getEmployeeSummary, getTechnicianSummary, countUnassignedQueue };
