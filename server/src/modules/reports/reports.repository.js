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
       requester.last_name AS requester_last_name, t.assigned_to,
       technician.first_name AS technician_first_name, technician.last_name AS technician_last_name,
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

module.exports = { buildTicketReportWhere, getTicketReportRows, countTicketReportRows, getDailyTicketCountsInDateRange };
