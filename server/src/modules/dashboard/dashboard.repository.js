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

async function getAverageFirstResponseTime({ createdBy, assignedTo } = {}, db = pool) {
  const conditions = ["first_response_at IS NOT NULL", "first_response_at >= created_at"];
  const values = [];
  if (createdBy !== undefined) { conditions.push("created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("assigned_to = ?"); values.push(assignedTo); }
  const [rows] = await db.query(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, first_response_at)) AS average_first_response_seconds,
       COUNT(*) AS responded_tickets
     FROM tickets WHERE ${conditions.join(" AND ")}`, values
  );
  return rows[0];
}

async function getAverageResolutionTime({ createdBy, assignedTo } = {}, db = pool) {
  const conditions = ["resolved_at IS NOT NULL", "resolved_at >= created_at"];
  const values = [];
  if (createdBy !== undefined) { conditions.push("created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("assigned_to = ?"); values.push(assignedTo); }
  const [rows] = await db.query(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, resolved_at)) AS average_resolution_seconds,
       COUNT(*) AS resolved_tickets
     FROM tickets WHERE ${conditions.join(" AND ")}`, values
  );
  return rows[0];
}

async function getSlaComplianceMetrics({ createdBy, assignedTo } = {}, db = pool) {
  const conditions = [];
  const values = [];
  if (createdBy !== undefined) { conditions.push("created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("assigned_to = ?"); values.push(assignedTo); }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  // Exclude invalid completions from their own dimension, including its tracked count.
  // Pending remains pending even after the deadline; only persisted completions are classified.
  const aggregates = [["response", "response_due_at", "first_response_at"],
    ["resolution", "resolution_due_at", "resolved_at"]].flatMap(([name, due, completion]) => {
    const tracked = `${due} IS NOT NULL AND (${completion} IS NULL OR ${completion} >= created_at)`;
    return [
      `COALESCE(SUM(${tracked}), 0) AS ${name}_tracked`,
      `COALESCE(SUM(${due} IS NOT NULL AND ${completion} IS NULL), 0) AS ${name}_pending`,
      `COALESCE(SUM(${due} IS NOT NULL AND ${completion} IS NOT NULL AND ${completion} >= created_at AND ${completion} <= ${due}), 0) AS ${name}_met`,
      `COALESCE(SUM(${due} IS NOT NULL AND ${completion} IS NOT NULL AND ${completion} >= created_at AND ${completion} > ${due}), 0) AS ${name}_missed`,
    ];
  });
  const [rows] = await db.query(`SELECT ${aggregates.join(", ")} FROM tickets${where}`, values);
  return rows[0];
}

async function getTicketTrend({ period, startDate, endDate, createdBy, assignedTo }, db = pool) {
  if (!["daily", "monthly"].includes(period)) throw new TypeError("Unsupported ticket trend period");
  const conditions = ["created_at >= ?", "created_at < ?"];
  const values = [startDate, endDate];
  if (createdBy !== undefined) { conditions.push("created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("assigned_to = ?"); values.push(assignedTo); }
  // Return string keys so mysql2 cannot deserialize DATE values in the host timezone.
  const format = period === "daily" ? "%Y-%m-%d" : "%Y-%m";
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(created_at, '${format}') AS period_key, COUNT(*) AS ticket_count
     FROM tickets WHERE ${conditions.join(" AND ")}
     GROUP BY period_key ORDER BY period_key ASC`, values
  );
  return rows;
}

async function getRecentTickets({ createdBy, assignedTo, limit = 5 } = {}, db = pool) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new TypeError("Limit must be an integer from 1 to 10");
  const conditions = [];
  const values = [];
  if (createdBy !== undefined) { conditions.push("t.created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("t.assigned_to = ?"); values.push(assignedTo); }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await db.query(
    `SELECT t.id, t.ticket_number, t.title, t.status, t.created_at,
       t.priority_id, p.name AS priority_name, t.category_id, c.name AS category_name
     FROM tickets AS t
     INNER JOIN ticket_categories AS c ON c.id = t.category_id
     INNER JOIN ticket_priorities AS p ON p.id = t.priority_id${where}
     ORDER BY t.created_at DESC, t.id DESC LIMIT ?`, [...values, limit]
  );
  return rows;
}

async function getRecentActivitySource(source, { createdBy, assignedTo, includeInternal = false, limit = 10 } = {}, db = pool) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError("Limit must be an integer from 1 to 20");
  const sources = {
    status: { table: "ticket_status_history", time: "changed_at", actor: "changed_by", extra: "e.from_status, e.to_status", filter: "e.from_status <> e.to_status" },
    assignment: { table: "ticket_assignments", time: "assigned_at", actor: "assigned_by", extra: "e.assignment_type, e.technician_id" },
    assignmentEnd: { table: "ticket_assignments", time: "unassigned_at", actor: null, extra: "e.technician_id", filter: "e.unassigned_at IS NOT NULL" },
    comment: { table: "ticket_comments", time: "created_at", actor: "user_id", extra: "e.comment_type" },
  };
  if (!Object.hasOwn(sources, source)) throw new TypeError("Unsupported activity source");
  const config = sources[source];
  const conditions = [];
  const values = [];
  if (createdBy !== undefined) { conditions.push("t.created_by = ?"); values.push(createdBy); }
  if (assignedTo !== undefined) { conditions.push("t.assigned_to = ?"); values.push(assignedTo); }
  if (config.filter) conditions.push(config.filter);
  if (source === "comment" && includeInternal !== true) { conditions.push("e.comment_type = ?"); values.push("PUBLIC"); }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const actorFields = config.actor
    ? `e.${config.actor} AS actor_id, actor.first_name AS actor_first_name, actor.last_name AS actor_last_name`
    : "NULL AS actor_id, NULL AS actor_first_name, NULL AS actor_last_name";
  const actorJoin = config.actor ? ` LEFT JOIN users AS actor ON actor.id = e.${config.actor}` : "";
  const [rows] = await db.query(
    `SELECT e.id AS event_id, t.id AS ticket_id, t.ticket_number, t.title AS ticket_title,
       e.${config.time} AS created_at, ${actorFields}, ${config.extra}
     FROM ${config.table} AS e INNER JOIN tickets AS t ON t.id = e.ticket_id${actorJoin}${where}
     ORDER BY e.${config.time} DESC, e.id DESC LIMIT ?`, [...values, limit]
  );
  return rows;
}

module.exports = { getEmployeeSummary, getTechnicianSummary, countUnassignedQueue, getAdminTicketSummary, getAdminUserSummary, getTicketStatusDistribution, getTicketCategoryDistribution, getTicketPriorityDistribution, getTechnicianWorkloadAnalytics, getAverageFirstResponseTime, getAverageResolutionTime, getSlaComplianceMetrics, getTicketTrend, getRecentTickets, getRecentActivitySource };
