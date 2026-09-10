const pool = require("../../config/database");

// Only these server-owned fragments may become SQL identifiers. Values always bind.
const FILTER_COLUMNS = Object.freeze({ status: "t.status", priorityId: "t.priority_id", categoryId: "t.category_id", technicianId: "t.assigned_to" });
function buildTicketReportWhere(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.startAt !== undefined) { conditions.push("t.created_at >= ?"); params.push(filters.startAt); }
  if (filters.endExclusive !== undefined) { conditions.push("t.created_at < ?"); params.push(filters.endExclusive); }
  for (const [key, column] of Object.entries(FILTER_COLUMNS)) {
    if (filters[key] !== undefined) { conditions.push(`${column} = ?`); params.push(filters[key]); }
  }
  return { whereSql: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "", params };
}
// Explicit projection keeps the foundation independent of full ticket-detail data.
async function getTicketReportRows({ filters, pagination }, db = pool) {
  const { limit, offset } = pagination;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new TypeError("Invalid report pagination");
  const { whereSql, params } = buildTicketReportWhere(filters);
  const [rows] = await db.query(
    `SELECT t.id, t.ticket_number, t.title, t.status, t.category_id, c.name AS category_name,
       t.priority_id, p.name AS priority_name, t.created_by, requester.first_name AS requester_first_name,
       requester.last_name AS requester_last_name, requester.email AS requester_email, t.assigned_to,
       technician.first_name AS technician_first_name, technician.last_name AS technician_last_name, technician.email AS technician_email,
       t.created_at, t.first_response_at, t.resolved_at, t.response_due_at, t.resolution_due_at
     FROM tickets AS t
     INNER JOIN ticket_categories AS c ON c.id = t.category_id
     INNER JOIN ticket_priorities AS p ON p.id = t.priority_id
     INNER JOIN users AS requester ON requester.id = t.created_by
     LEFT JOIN users AS technician ON technician.id = t.assigned_to${whereSql}
     ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
  );
  return rows;
}
async function countTicketReportRows({ filters }, db = pool) {
  const { whereSql, params } = buildTicketReportWhere(filters);
  // Required identity joins in the row query are guaranteed by ticket foreign keys.
  const [rows] = await db.query(`SELECT COUNT(*) AS total FROM tickets AS t${whereSql}`, params);
  return rows[0].total;
}
async function getDailyTicketCountsInDateRange({ startDateTime, endExclusiveDateTime }, db = pool) {
  const { whereSql, params } = buildTicketReportWhere({ startAt: startDateTime, endExclusive: endExclusiveDateTime });
  // String date keys avoid mysql2 converting DATE values through the server-local timezone.
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(t.created_at, '%Y-%m-%d') AS report_date, COUNT(*) AS ticket_count
     FROM tickets AS t${whereSql}
     GROUP BY report_date ORDER BY report_date ASC`, params
  );
  return rows;
}

async function getPerformanceTechnicians(db = pool) {
  const [rows] = await db.query("SELECT id, first_name, last_name, email, is_active FROM users WHERE role = 'TECHNICIAN'");
  return rows;
}
async function getTechnicianHistoricalCounts(filters, kind, db = pool) {
  if (!["assignment", "resolution"].includes(kind)) throw new TypeError("Unsupported historical count");
  const { whereSql, params } = buildTicketReportWhere(filters);
  const source = kind === "assignment" ? "ticket_assignments" : "ticket_status_history";
  const actor = kind === "assignment" ? "technician_id" : "changed_by";
  const extra = kind === "resolution" ? `${whereSql ? " AND" : " WHERE"} h.to_status = 'RESOLVED'` : "";
  const [rows] = await db.query(
    `SELECT h.${actor} AS technician_id, COUNT(DISTINCT t.id) AS ticket_count
     FROM ${source} AS h INNER JOIN tickets AS t ON t.id = h.ticket_id${whereSql}${extra}
     GROUP BY h.${actor}`, params);
  return rows;
}
async function getTechnicianCompletionMetrics(filters, kind, db = pool) {
  if (!["response", "resolution"].includes(kind)) throw new TypeError("Unsupported completion metric");
  const { whereSql, params } = buildTicketReportWhere(filters);
  const completion = kind === "response" ? "first_response_at" : "resolved_at";
  const due = kind === "response" ? "response_due_at" : "resolution_due_at";
  const events = kind === "response" ? `
    SELECT h.ticket_id, h.changed_by AS actor_id, h.changed_at AS event_at
    FROM ticket_status_history h INNER JOIN eligible t ON t.id = h.ticket_id
    WHERE h.from_status = 'ASSIGNED' AND h.to_status = 'IN_PROGRESS'
    UNION ALL
    SELECT c.ticket_id, c.user_id AS actor_id, c.created_at AS event_at
    FROM ticket_comments c INNER JOIN eligible t ON t.id = c.ticket_id
    INNER JOIN users author ON author.id = c.user_id
    WHERE c.comment_type = 'PUBLIC' AND author.role IN ('TECHNICIAN', 'ADMIN')` : `
    SELECT h.ticket_id, h.changed_by AS actor_id, h.changed_at AS event_at
    FROM ticket_status_history h INNER JOIN eligible t ON t.id = h.ticket_id
    WHERE h.to_status = 'RESOLVED'`;
  // Earliest eligible response / latest resolution must match the persisted timestamp.
  // Different actors at that timestamp are ambiguous and are deliberately excluded.
  const edge = kind === "response" ? "MIN" : "MAX";
  const [rows] = await db.query(
    `WITH eligible AS (
       SELECT t.id, t.created_at, t.${completion} AS completed_at, t.${due} AS due_at
       FROM tickets t${whereSql}
     ), events AS (${events}), attributed AS (
       SELECT t.id, MIN(CASE WHEN e.event_at = t.completed_at THEN e.actor_id END) AS technician_id
       FROM eligible t INNER JOIN events e ON e.ticket_id = t.id
       WHERE t.completed_at IS NOT NULL AND t.completed_at >= t.created_at
       GROUP BY t.id, t.completed_at
       HAVING ${edge}(e.event_at) = t.completed_at
          AND COUNT(DISTINCT CASE WHEN e.event_at = t.completed_at THEN e.actor_id END) = 1
     )
     SELECT a.technician_id, COUNT(*) AS samples,
       AVG(TIMESTAMPDIFF(SECOND, t.created_at, t.completed_at)) AS average_seconds,
       COALESCE(SUM(t.due_at IS NOT NULL AND t.completed_at <= t.due_at), 0) AS sla_met,
       COALESCE(SUM(t.due_at IS NOT NULL AND t.completed_at > t.due_at), 0) AS sla_missed
     FROM attributed a INNER JOIN eligible t ON t.id = a.id
     INNER JOIN users actor ON actor.id = a.technician_id AND actor.role = 'TECHNICIAN'
     GROUP BY a.technician_id`, params);
  return rows;
}

async function getSlaReportMetrics({ filters }, db = pool) {
  const { whereSql, params } = buildTicketReportWhere(filters);
  const aggregates = [["response", "response_due_at", "first_response_at"],
    ["resolution", "resolution_due_at", "resolved_at"]].flatMap(([dimension, deadline, completion]) => [
    `COALESCE(SUM(t.${deadline} IS NOT NULL), 0) AS ${dimension}_tracked`,
    `COALESCE(SUM(t.${deadline} IS NOT NULL AND t.${completion} IS NULL), 0) AS ${dimension}_pending`,
    `COALESCE(SUM(t.${deadline} IS NOT NULL AND t.${completion} IS NOT NULL AND t.${completion} <= t.${deadline}), 0) AS ${dimension}_met`,
    `COALESCE(SUM(t.${deadline} IS NOT NULL AND t.${completion} IS NOT NULL AND t.${completion} > t.${deadline}), 0) AS ${dimension}_missed`,
  ]);
  const [rows] = await db.query(`SELECT ${aggregates.join(", ")} FROM tickets AS t${whereSql}`, params);
  return rows[0];
}

async function getCategoryReport({ filters }, db = pool) {
  const { whereSql, params } = buildTicketReportWhere(filters);
  const [rows] = await db.query(
    `SELECT c.id AS category_id, c.name AS category_name, c.is_active,
       COUNT(t.id) AS total_tickets,
       COALESCE(SUM(t.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED')), 0) AS active_tickets,
       COALESCE(SUM(t.status = 'RESOLVED'), 0) AS resolved_tickets,
       COALESCE(SUM(t.status = 'CLOSED'), 0) AS closed_tickets
     FROM ticket_categories c LEFT JOIN (
       SELECT t.id, t.category_id, t.status FROM tickets t${whereSql}
     ) t ON t.category_id = c.id
     GROUP BY c.id, c.name, c.is_active
     ORDER BY total_tickets DESC, category_name ASC, category_id ASC`, params);
  return rows;
}

async function getPriorityReport({ filters }, db = pool) {
  const { whereSql, params } = buildTicketReportWhere(filters);
  const [rows] = await db.query(
    `SELECT p.id AS priority_id, p.name AS priority_name,
       COUNT(t.id) AS total_tickets,
       COALESCE(SUM(t.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED')), 0) AS active_tickets,
       COALESCE(SUM(t.status = 'RESOLVED'), 0) AS resolved_tickets,
       COALESCE(SUM(t.status = 'CLOSED'), 0) AS closed_tickets
     FROM ticket_priorities p LEFT JOIN (
       SELECT t.id, t.priority_id, t.status FROM tickets t${whereSql}
     ) t ON t.priority_id = p.id
     GROUP BY p.id, p.name
     ORDER BY priority_name ASC, priority_id ASC`, params);
  return rows;
}

module.exports = { buildTicketReportWhere, getTicketReportRows, countTicketReportRows, getDailyTicketCountsInDateRange, getPerformanceTechnicians, getTechnicianHistoricalCounts, getTechnicianCompletionMetrics, getSlaReportMetrics, getCategoryReport, getPriorityReport };
