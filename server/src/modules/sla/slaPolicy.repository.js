const pool = require("../../config/database");

const SLA_POLICY_SELECT = `
  SELECT sp.id, sp.priority_id, tp.name AS priority_name,
    sp.response_time_minutes, sp.resolution_time_minutes,
    sp.is_active, sp.created_at, sp.updated_at
  FROM sla_policies AS sp
  INNER JOIN ticket_priorities AS tp ON tp.id = sp.priority_id
`;

async function findAll(db = pool) {
  const [rows] = await db.query(`${SLA_POLICY_SELECT} ORDER BY sp.response_time_minutes ASC, sp.id ASC`);
  return rows;
}

async function findById(id, db = pool) {
  const [rows] = await db.query(`${SLA_POLICY_SELECT} WHERE sp.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByPriorityId(priorityId, db = pool) {
  const [rows] = await db.query(`${SLA_POLICY_SELECT} WHERE sp.priority_id = ? LIMIT 1`, [priorityId]);
  return rows[0] || null;
}

async function findByPriorityName(priorityName, db = pool) {
  const [rows] = await db.query(`${SLA_POLICY_SELECT} WHERE UPPER(tp.name) = UPPER(?) LIMIT 1`, [priorityName]);
  return rows[0] || null;
}

async function updateById(id, { responseTimeMinutes, resolutionTimeMinutes }, db = pool) {
  const [result] = await db.query(
    `UPDATE sla_policies SET response_time_minutes = ?, resolution_time_minutes = ? WHERE id = ?`,
    [responseTimeMinutes, resolutionTimeMinutes, id]
  );
  return result.affectedRows;
}

async function setActiveStatus(id, isActive, db = pool) {
  const [result] = await db.query("UPDATE sla_policies SET is_active = ? WHERE id = ?", [isActive, id]);
  return result.affectedRows;
}

module.exports = { findAll, findById, findByPriorityId, findByPriorityName, updateById, setActiveStatus };
