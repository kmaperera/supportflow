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

async function getAdminTicketSummary(db = pool) {
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
     FROM tickets`
  );
  return rows[0];
}

async function getAdminUserSummary(db = pool) {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(role = 'EMPLOYEE'), 0) AS total_employees,
       COALESCE(SUM(role = 'TECHNICIAN'), 0) AS total_technicians,
       COALESCE(SUM(role = 'EMPLOYEE' AND is_active = TRUE), 0) AS active_employees,
       COALESCE(SUM(role = 'TECHNICIAN' AND is_active = TRUE), 0) AS active_technicians
     FROM users`
  );
  return rows[0];
}

async function getTicketStatusDistribution({ createdBy, assignedTo } = {}, db = pool) {
  const conditions = [];
  const values = [];
  if (createdBy !== undefined) { conditions.push("created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("assigned_to = ?"); values.push(assignedTo); }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await db.query(`SELECT status, COUNT(*) AS count FROM tickets${where} GROUP BY status`, values);
  return rows;
}

module.exports = { getEmployeeSummary, getTechnicianSummary, countUnassignedQueue, getAdminTicketSummary, getAdminUserSummary, getTicketStatusDistribution };
