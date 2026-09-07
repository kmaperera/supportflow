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

const CREATOR_SORT_COLUMNS = {
  created_at: "t.created_at", updated_at: "t.updated_at",
  ticket_number: "t.ticket_number", title: "t.title",
  status: "t.status", priority: "p.sort_order",
};

function creatorFilters(userId, filters) {
  const conditions = ["t.created_by = ?"];
  const values = [userId];
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
  return { where: conditions.join(" AND "), values };
}

async function findByCreator(userId, options = {}) {
  const { where, values } = creatorFilters(userId, options);
  const sortBy = options.sortBy ?? "created_at";
  const order = String(options.order ?? "desc").toLowerCase();
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  if (!Object.hasOwn(CREATOR_SORT_COLUMNS, sortBy) || !["asc", "desc"].includes(order) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError("Invalid ticket listing options");
  }
  const [rows] = await pool.query(
    `${TICKET_SELECT} WHERE ${where}
     ORDER BY ${CREATOR_SORT_COLUMNS[sortBy]} ${order}, t.id ${order} LIMIT ? OFFSET ?`,
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

module.exports = {
  findByCreator, countByCreator,
  create, assignTicketNumber, findById, findByTicketNumber,
  findCategoryById, findPriorityById,
};


