const { TICKET_SORT_COLUMNS, TICKET_SORT_DIRECTIONS, DEFAULT_LIMIT, MAX_LIMIT } = require("../../constants/ticketQuery");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");
﻿const { USER_ROLES } = require("../../constants/roles");
const pool = require("../../config/database");

const TICKET_SELECT = `
  SELECT
    t.id, t.ticket_number, t.title, t.description, t.status, t.created_by,
    creator.first_name AS creator_first_name,
    creator.last_name AS creator_last_name,
    creator.email AS creator_email,
    t.category_id, c.name AS category_name,
    t.priority_id, p.name AS priority_name, p.sort_order AS priority_sort_order,
    t.assigned_to,
    assignee.first_name AS assignee_first_name,
    assignee.last_name AS assignee_last_name,
    assignee.email AS assignee_email,
    t.first_response_at, t.resolved_at, t.closed_at, t.resolution_summary,
    t.sla_response_due_at, t.sla_resolution_due_at,
    t.sla_response_breached, t.sla_resolution_breached,
    t.created_at, t.updated_at
  FROM tickets AS t
  INNER JOIN ticket_categories AS c ON c.id = t.category_id
  INNER JOIN ticket_priorities AS p ON p.id = t.priority_id
  INNER JOIN users AS creator ON creator.id = t.created_by
  LEFT JOIN users AS assignee ON assignee.id = t.assigned_to
`;

async function getWorkflowSummary(db = pool) {
  const activeStatuses = [TICKET_STATUSES.ASSIGNED, TICKET_STATUSES.IN_PROGRESS,
    TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.REOPENED];
  const [ticketRows] = await db.query(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN assigned_to IS NULL AND status = ? THEN 1 ELSE 0 END), 0) AS unassigned,
       COALESCE(SUM(CASE WHEN assigned_to IS NOT NULL AND status IN (?, ?, ?, ?) THEN 1 ELSE 0 END), 0) AS assigned_active,
       COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS assigned_count,
       COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS in_progress_count,
       COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS waiting_for_user_count,
       COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS reopened_count,
       COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS resolved_count,
       COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS closed_count
     FROM tickets`,
    [TICKET_STATUSES.OPEN, ...activeStatuses, ...activeStatuses, TICKET_STATUSES.RESOLVED, TICKET_STATUSES.CLOSED]
  );
  const [technicianRows] = await db.query(
    `SELECT COUNT(DISTINCT u.id) AS active_technicians,
       COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN u.id END) AS technicians_with_active_workload,
       COUNT(DISTINCT u.id) - COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN u.id END) AS technicians_without_active_workload
     FROM users AS u
     LEFT JOIN tickets AS t ON t.assigned_to = u.id AND t.status IN (?, ?, ?, ?)
     WHERE u.role = ? AND u.is_active = TRUE`,
    [...activeStatuses, USER_ROLES.TECHNICIAN]
  );
  return { ...ticketRows[0], ...technicianRows[0] };
}

async function create(ticketData, db = pool) {
  const { createdBy, categoryId, priorityId, title, description } = ticketData;
  const [result] = await db.query(
    `INSERT INTO tickets
      (created_by, category_id, priority_id, title, description,
       ticket_number, assigned_to, status)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 'OPEN')`,
    [createdBy, categoryId, priorityId, title, description]
  );
  return result.insertId;
}

async function assignTicketNumber(id, ticketNumber, db = pool) {
  const [result] = await db.query(
    "UPDATE tickets SET ticket_number = ? WHERE id = ?",
    [ticketNumber, id]
  );
  return result.affectedRows;
}

async function findById(id, db = pool) {
  const [rows] = await db.query(`${TICKET_SELECT} WHERE t.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByTicketNumber(ticketNumber, db = pool) {
  const [rows] = await db.query(
    `${TICKET_SELECT} WHERE t.ticket_number = ? LIMIT 1`,
    [ticketNumber]
  );
  return rows[0] || null;
}

async function findCategoryById(categoryId, db = pool) {
  const [rows] = await db.query(
    "SELECT id, name, description, is_active FROM ticket_categories WHERE id = ? LIMIT 1",
    [categoryId]
  );
  return rows[0] || null;
}

async function findPriorityById(priorityId, db = pool) {
  const [rows] = await db.query(
    "SELECT id, name, description, sort_order, is_active FROM ticket_priorities WHERE id = ? LIMIT 1",
    [priorityId]
  );
  return rows[0] || null;
}


// Shared by employee and queue list/count queries; LIKE uses the database collation.
function buildTicketFilters(filters, conditions, values) {
  if (filters.search) {
    conditions.push("(t.ticket_number LIKE ? OR t.title LIKE ? OR t.description LIKE ?)");
    values.push(...Array(3).fill(`%${filters.search}%`));
  }
  for (const [key, column] of [["status", "t.status"], ["categoryId", "t.category_id"], ["priorityId", "t.priority_id"]]) {
    if (filters[key] !== undefined) {
      conditions.push(`${column} = ?`);
      values.push(filters[key]);
    }
  }
  if (filters.fromDate !== undefined) {
    conditions.push("t.created_at >= ?");
    values.push(filters.fromDate);
  }
  if (filters.toDate !== undefined) {
    conditions.push("t.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    values.push(filters.toDate);
  }
}

function creatorFilters(userId, filters) {
  const conditions = ["t.created_by = ?"];
  const values = [userId];
  buildTicketFilters(filters, conditions, values);
  return { where: conditions.join(" AND "), values };
}

async function findByCreator(userId, options = {}) {
  const { where, values } = creatorFilters(userId, options);
  const sortBy = options.sortBy ?? "created_at";
  const order = String(options.order ?? "desc").toLowerCase();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  if (!Object.hasOwn(TICKET_SORT_COLUMNS, sortBy) || !TICKET_SORT_DIRECTIONS.includes(order) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT ||
      !Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError("Invalid ticket listing options");
  }
  const [rows] = await pool.query(
    `${TICKET_SELECT} WHERE ${where}
     ORDER BY ${TICKET_SORT_COLUMNS[sortBy]} ${order.toUpperCase()}, t.id ${order.toUpperCase()} LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return rows;
}

async function countByCreator(userId, filters = {}) {
  const { where, values } = creatorFilters(userId, filters);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM tickets AS t WHERE ${where}`, values
  );
  return Number(rows[0].total);
}

async function updateEmployeeDetails(id, data) {
  const columns = {
    categoryId: "category_id", priorityId: "priority_id",
    title: "title", description: "description",
  };
  const entries = Object.entries(data);
  if (!entries.length || entries.some(([key]) => !Object.hasOwn(columns, key))) {
    throw new TypeError("Only categoryId, priorityId, title, and description may be updated");
  }
  const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(", ");
  const [result] = await pool.query(
    `UPDATE tickets SET ${assignments} WHERE id = ?`,
    [...entries.map(([, value]) => value), id]
  );
  return result.affectedRows;
}

function queueFilters(options) {
  const conditions = [];
  const values = [];
  if (options.currentUserRole === USER_ROLES.TECHNICIAN) {
    if (!options.currentUserId) throw new TypeError("Queue user ID is required");
    conditions.push("(t.assigned_to IS NULL OR t.assigned_to = ?)");
    values.push(options.currentUserId);
  } else if (options.currentUserRole !== USER_ROLES.ADMIN) {
    throw new TypeError("Queue requires a technician or administrator");
  }
  buildTicketFilters(options, conditions, values);
  if (options.assignedTo !== undefined) {
    conditions.push("t.assigned_to = ?");
    values.push(options.assignedTo);
  }
  if (options.assignment !== undefined) {
    if (options.assignment === "unassigned") conditions.push("t.assigned_to IS NULL");
    else if (options.assignment === "assigned") conditions.push("t.assigned_to IS NOT NULL");
    else if (options.assignment === "mine") {
      if (!options.currentUserId) throw new TypeError("Queue user ID is required");
      conditions.push("t.assigned_to = ?");
      values.push(options.currentUserId);
    } else throw new TypeError("Invalid assignment filter");
  }
  return { where: conditions.length ? " WHERE " + conditions.join(" AND ") : "", values };
}

async function findQueue(options) {
  return findTicketList(queueFilters(options), options);
}

async function findTicketList({ where, values }, options) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const order = String(options.order ?? "desc").toLowerCase();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT ||
      !Number.isSafeInteger(offset) || offset < 0 || !TICKET_SORT_DIRECTIONS.includes(order)) {
    throw new TypeError("Invalid queue options");
  }
  let sorting = "p.sort_order DESC, t.created_at ASC, t.id ASC";
  if (options.sortBy !== undefined) {
    if (!Object.hasOwn(TICKET_SORT_COLUMNS, options.sortBy)) throw new TypeError("Invalid queue sort column");
    sorting = `${TICKET_SORT_COLUMNS[options.sortBy]} ${order.toUpperCase()}, t.id ${order.toUpperCase()}`;
  }
  const [rows] = await pool.query(
    `${TICKET_SELECT}${where} ORDER BY ${sorting} LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return rows;
}

function assignedTechnicianFilters(technicianId, options) {
  const conditions = ["t.assigned_to = ?", "t.status IN (?, ?, ?, ?)"];
  const values = [technicianId, TICKET_STATUSES.ASSIGNED, TICKET_STATUSES.IN_PROGRESS,
    TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.REOPENED];
  buildTicketFilters(options, conditions, values);
  return { where: " WHERE " + conditions.join(" AND "), values };
}

async function findAssignedToTechnician(technicianId, options = {}) {
  return findTicketList(assignedTechnicianFilters(technicianId, options), options);
}

async function countAssignedToTechnician(technicianId, options = {}) {
  const { where, values } = assignedTechnicianFilters(technicianId, options);
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM tickets AS t${where}`, values);
  return Number(rows[0].total);
}

async function countQueue(options) {
  const { where, values } = queueFilters(options);
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM tickets AS t${where}`, values);
  return Number(rows[0].total);
}

async function assignTechnician(ticketId, technicianId, status, db = pool) {
  const [result] = await db.query(
    `UPDATE tickets SET assigned_to = ?, status = ?
     WHERE id = ? AND assigned_to IS NULL AND status = 'OPEN'`,
    [technicianId, status, ticketId]
  );
  return result.affectedRows;
}

async function lockById(id, db = pool) {
  const [rows] = await db.query("SELECT id FROM tickets WHERE id = ? FOR UPDATE", [id]);
  return rows[0] || null;
}

async function unassignTicket(ticketId, db = pool) {
  const [result] = await db.query(
    `UPDATE tickets SET assigned_to = NULL, status = ?
     WHERE id = ? AND assigned_to IS NOT NULL AND status IN (?, ?, ?, ?)`,
    [TICKET_STATUSES.OPEN, ticketId, TICKET_STATUSES.ASSIGNED,
      TICKET_STATUSES.IN_PROGRESS, TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.REOPENED]
  );
  return result.affectedRows;
}

async function updateAssignment(ticketId, technicianId, status, db = pool) {
  const [result] = await db.query(
    "UPDATE tickets SET assigned_to = ?, status = ? WHERE id = ?",
    [technicianId, status, ticketId]
  );
  return result.affectedRows;
}

async function updateWorkingStatus(ticketId, newStatus, setFirstResponse, db = pool) {
  const firstResponse = setFirstResponse === true
    ? ", first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP)"
    : "";
  const [result] = await db.query(
    `UPDATE tickets SET status = ?${firstResponse} WHERE id = ?`,
    [newStatus, ticketId]
  );
  return result.affectedRows;
}

async function setFirstResponseIfUnset(ticketId, db = pool) {
  const [result] = await db.query(
    `UPDATE tickets SET first_response_at = CURRENT_TIMESTAMP
     WHERE id = ? AND first_response_at IS NULL`,
    [ticketId]
  );
  return result.affectedRows;
}

async function updatePriority(ticketId, priorityId, db = pool) {
  const [result] = await db.query(
    "UPDATE tickets SET priority_id = ? WHERE id = ?",
    [priorityId, ticketId]
  );
  return result.affectedRows;
}

async function resolveTicket(ticketId, resolutionSummary, db = pool) {
  const [result] = await db.query(
    "UPDATE tickets SET status = ?, resolution_summary = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
    [TICKET_STATUSES.RESOLVED, resolutionSummary, ticketId]
  );
  return result.affectedRows;
}

async function closeTicket(ticketId, db = pool) {
  const [result] = await db.query(
    "UPDATE tickets SET status = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?",
    [TICKET_STATUSES.CLOSED, ticketId]
  );
  return result.affectedRows;
}

async function reopenTicket(ticketId, db = pool) {
  const [result] = await db.query(
    "UPDATE tickets SET status = ?, resolved_at = NULL, resolution_summary = NULL, closed_at = NULL WHERE id = ?",
    [TICKET_STATUSES.REOPENED, ticketId]
  );
  return result.affectedRows;
}

module.exports = { reopenTicket, closeTicket, resolveTicket, updatePriority, updateWorkingStatus, setFirstResponseIfUnset,
  lockById, updateAssignment, unassignTicket,
  assignTechnician,
  findQueue, countQueue, findAssignedToTechnician, countAssignedToTechnician,
  updateEmployeeDetails,
  findByCreator, countByCreator,
  getWorkflowSummary, create, assignTicketNumber, findById, findByTicketNumber,
  findCategoryById, findPriorityById,
};






