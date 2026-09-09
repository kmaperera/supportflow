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

async function getTicketCategoryDistribution({ createdBy, assignedTo } = {}, db = pool) {
  const conditions = [];
  const values = [];
  if (createdBy !== undefined) { conditions.push("t.created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("t.assigned_to = ?"); values.push(assignedTo); }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await db.query(
    `SELECT c.id AS category_id, c.name AS category_name, COUNT(*) AS count
     FROM tickets AS t INNER JOIN ticket_categories AS c ON c.id = t.category_id${where}
     GROUP BY c.id, c.name ORDER BY count DESC, c.name ASC`, values
  );
  return rows;
}

async function getTicketPriorityDistribution({ createdBy, assignedTo } = {}, db = pool) {
  const conditions = ["t.priority_id = p.id"];
  const values = [];
  if (createdBy !== undefined) { conditions.push("t.created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("t.assigned_to = ?"); values.push(assignedTo); }
  const [rows] = await db.query(
    `SELECT p.id AS priority_id, p.name AS priority_name, COUNT(t.id) AS count
     FROM ticket_priorities AS p LEFT JOIN tickets AS t ON ${conditions.join(" AND ")}
     GROUP BY p.id, p.name`, values
  );
  return rows;
}

async function getTechnicianWorkloadAnalytics(db = pool) {
  // Current ownership only: resolution retains assigned_to; reassignment replaces it.
  const [rows] = await db.query(
    `SELECT u.id AS technician_id, u.first_name, u.last_name,
       CONCAT_WS(' ', NULLIF(TRIM(u.first_name), ''), NULLIF(TRIM(u.last_name), '')) AS technician_name,
       u.email, u.is_active,
       COALESCE(SUM(t.status = 'ASSIGNED'), 0) AS assigned_tickets,
       COALESCE(SUM(t.status = 'IN_PROGRESS'), 0) AS in_progress_tickets,
       COALESCE(SUM(t.status = 'WAITING_FOR_USER'), 0) AS waiting_for_user_tickets,
       COALESCE(SUM(t.status = 'REOPENED'), 0) AS reopened_tickets,
       COALESCE(SUM(t.status IN ('ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED')), 0) AS active_tickets,
       COALESCE(SUM(t.status = 'RESOLVED'), 0) AS resolved_tickets
     FROM users AS u LEFT JOIN tickets AS t ON t.assigned_to = u.id
     WHERE u.role = 'TECHNICIAN'
     GROUP BY u.id, u.first_name, u.last_name, u.email, u.is_active
     ORDER BY active_tickets DESC, technician_name ASC, technician_id ASC`
  );
  return rows;
}

module.exports = { getEmployeeSummary, getTechnicianSummary, countUnassignedQueue, getAdminTicketSummary, getAdminUserSummary, getTicketStatusDistribution, getTicketCategoryDistribution, getTicketPriorityDistribution, getTechnicianWorkloadAnalytics };
