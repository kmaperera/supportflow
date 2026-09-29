const repository = require('./audit.repository');
const pool = require('../../config/database');
const { normalizeQuery } = require('./audit.validation');
// Explicit allowlist: arbitrary future metadata must never be echoed to clients.
function safeMetadata(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safe = {};
  if (typeof value.isDemo === 'boolean') safe.isDemo = value.isDemo;
  if (Number.isSafeInteger(value.schemaVersion) && value.schemaVersion > 0) safe.schemaVersion = value.schemaVersion;
  return Object.keys(safe).length ? safe : null;
}
async function getLogs(params, db) {
  const options = normalizeQuery(params);
  if (!db) {
    const connection = await pool.getConnection();
    let previousZone;
    try {
      const [rows] = await connection.query('SELECT @@session.time_zone AS zone');
      previousZone = rows[0].zone;
      await connection.query("SET SESSION time_zone = '+00:00'");
      return await getLogs(params, connection);
    } finally {
      try { if (previousZone !== undefined) await connection.query('SET SESSION time_zone = ?', [previousZone]); }
      catch { connection.destroy(); }
      finally { connection.release(); }
    }
  }
  const rows = await repository.findAll(options, db);
  const total = await repository.countAll(options.filters, db);
  const { page, limit } = options;
  const totalPages = Math.ceil(total / limit);
  return { logs: rows.map(row => ({ id: String(row.id),
    actor: row.actor_user_id == null ? null : { id: String(row.actor_user_id), name: [row.first_name, row.last_name].filter(Boolean).join(' '), email: row.email ?? null, role: row.role ?? null },
    action: row.action, entityType: row.entity_type, entityId: row.entity_id == null ? null : String(row.entity_id),
    description: row.description, metadata: safeMetadata(row.metadata), ipAddress: row.ip_address, createdAt: row.created_at })),
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 && totalPages > 0 } };
}
module.exports = { getLogs, safeMetadata };
