const pool = require('../../config/database');
function where(filters) {
  const clauses = [], values = [];
  for (const [key, column] of [['action', 'action'], ['actorUserId', 'actor_user_id'], ['entityType', 'entity_type'], ['entityId', 'entity_id']]) {
    if (filters[key] !== undefined) { clauses.push(`a.${column} = ?`); values.push(filters[key]); }
  }
  if (filters.startAt) { clauses.push('a.created_at >= ?'); values.push(filters.startAt); }
  if (filters.endExclusive) { clauses.push('a.created_at < ?'); values.push(filters.endExclusive); }
  if (filters.search) {
    clauses.push("(a.action LIKE ? ESCAPE '!' OR a.description LIKE ? ESCAPE '!')");
    const pattern = `%${filters.search.replace(/[!%_]/g, value => `!${value}`)}%`;
    values.push(pattern, pattern);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values };
}
async function findAll({ filters, limit, offset }, db = pool) {
  const { sql, values } = where(filters);
  const [rows] = await db.query(`SELECT CAST(a.id AS CHAR) AS id, CAST(a.actor_user_id AS CHAR) AS actor_user_id, a.action, a.entity_type, CAST(a.entity_id AS CHAR) AS entity_id,
    a.description, a.metadata, a.ip_address,
    DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
    u.first_name, u.last_name, u.email, u.role
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id${sql}
    ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  return rows;
}
async function countAll(filters, db = pool) {
  const { sql, values } = where(filters);
  const [rows] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs a${sql}`, values);
  return Number(rows[0].total);
}
module.exports = { findAll, countAll };
