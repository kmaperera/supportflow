const repository = require('./audit.repository');
const pool = require('../../config/database');
const { normalizeQuery } = require('./audit.validation');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require('../../constants/audit');
const { sanitizeMetadata, isPlainObject, MAX_METADATA_BYTES } = require('./audit.metadata');
const { isIP } = require('node:net');
const actions = new Set(Object.values(AUDIT_ACTIONS));
const entities = new Set(Object.values(AUDIT_ENTITY_TYPES));

function normalizeId(value) {
  if (value == null) return null;
  if (!['string', 'number', 'bigint'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isSafeInteger(value)) ||
      !/^[1-9]\d*$/.test(String(value)) || String(value).length > 20 ||
      BigInt(value) > 18446744073709551615n) throw new TypeError('Invalid audit identifier');
  return String(value);
}

function buildEntry(entry) {
  if (!isPlainObject(entry)) throw new TypeError('Invalid audit entry');
  const fields = new Set(['actorUserId', 'action', 'entityType', 'entityId', 'description', 'metadata', 'ipAddress']);
  const descriptors = Object.getOwnPropertyDescriptors(entry);
  if (Reflect.ownKeys(descriptors).some(key => !fields.has(key) || !Object.hasOwn(descriptors[key], 'value'))) throw new TypeError('Invalid audit fields');
  if (!actions.has(entry.action) || (entry.entityType != null && !entities.has(entry.entityType))) throw new TypeError('Invalid audit action/entity');
  const entityId = normalizeId(entry.entityId);
  if (entityId !== null && entry.entityType == null) throw new TypeError('Audit entity type is required for entity ID');
  if (entry.description != null && (typeof entry.description !== 'string' || Array.from(entry.description).length > 1000)) throw new TypeError('Invalid audit description');
  let ipAddress = entry.ipAddress ?? null;
  if (ipAddress !== null) {
    if (typeof ipAddress !== 'string' || ipAddress.length > 45 || !isIP(ipAddress.trim()) || ipAddress.includes('%')) throw new TypeError('Invalid audit IP address');
    ipAddress = ipAddress.trim();
  }
  return { actorUserId: normalizeId(entry.actorUserId), action: entry.action,
    entityType: entry.entityType ?? null, entityId, description: entry.description ?? null,
    metadata: sanitizeMetadata(entry.metadata), ipAddress };
}

// Default: call after a successful business commit; failures never undo it.
// Transactions must opt into strict mode, then commit/rollback in their caller.
async function log(entry, { connection, strict = false } = {}) {
  let normalized;
  try { normalized = buildEntry(entry); }
  catch {
    console.error('Audit log write failed: invalid entry');
    if (strict) { const error = new Error('Invalid audit entry'); error.code = 'AUDIT_INVALID_ENTRY'; throw error; }
    return null;
  }
  try {
    const id = normalizeId(await repository.create(normalized, connection));
    if (id === null) throw new Error();
    return { id };
  } catch {
    // SDK errors can include SQL and bound credentials. No raw cause or metadata.
    console.error('Audit log write failed: database operation');
    if (strict) { const error = new Error('Audit write failed'); error.code = 'AUDIT_WRITE_FAILED'; throw error; }
    return null;
  }
}

// Explicit allowlist: arbitrary future metadata must never be echoed to clients.
function safeMetadata(value) {
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_METADATA_BYTES) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  try { value = sanitizeMetadata(value); } catch { return null; }
  if (!value) return null;
  const safe = {};
  if (typeof value.isDemo === 'boolean') safe.isDemo = value.isDemo;
  if (Number.isSafeInteger(value.schemaVersion) && value.schemaVersion > 0) safe.schemaVersion = value.schemaVersion;
  for (const key of ['role', 'previousRole', 'newRole']) {
    if (['ADMIN', 'EMPLOYEE', 'TECHNICIAN'].includes(value[key])) safe[key] = value[key];
  }
  for (const key of ['status', 'previousStatus', 'newStatus']) {
    if (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(value[key])) safe[key] = value[key];
  }
  for (const key of ['isActive', 'previousActive', 'newActive']) {
    if (typeof value[key] === 'boolean') safe[key] = value[key];
  }
  if (typeof value.name === 'string' && Array.from(value.name).length <= 100) safe.name = value.name;
  for (const key of ['categoryId', 'newTechnicianId', 'previousTechnicianId', 'newAssignmentId', 'previousAssignmentId', 'previousPriorityId', 'newPriorityId']) {
    if (typeof value[key] === 'string' && /^[1-9]\d{0,19}$/.test(value[key]) && BigInt(value[key]) <= 18446744073709551615n) safe[key] = value[key];
  }
  for (const key of ['previousResponseMinutes', 'newResponseMinutes', 'previousResolutionMinutes', 'newResolutionMinutes']) {
    if (Number.isInteger(value[key]) && value[key] > 0 && value[key] <= 4294967295) safe[key] = value[key];
  }
  const fields = new Set(['name', 'description', 'title', 'content', 'categoryId', 'responseTimeMinutes', 'resolutionTimeMinutes']);
  if (Array.isArray(value.changedFields) && value.changedFields.length <= fields.size && value.changedFields.every(field => fields.has(field))) safe.changedFields = [...new Set(value.changedFields)];
  if (['INVALID_CREDENTIALS', 'ACCOUNT_INACTIVE', 'SESSION_NOT_ACTIVE'].includes(value.reasonCode)) safe.reasonCode = value.reasonCode;
  for (const key of ['sessionsRevoked', 'forcedChange']) {
    if (typeof value[key] === 'boolean') safe[key] = value[key];
  }
  if (Number.isSafeInteger(value.revokedSessionCount) && value.revokedSessionCount >= 0) safe.revokedSessionCount = value.revokedSessionCount;
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
module.exports = { log, getLogs, safeMetadata };
