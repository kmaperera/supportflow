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

module.exports = {
  create, assignTicketNumber, findById, findByTicketNumber,
  findCategoryById, findPriorityById,
};

