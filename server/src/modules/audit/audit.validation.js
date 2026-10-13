const ApiError = require('../../utils/ApiError');
const { dateBoundary } = require('../reports/reports.validation');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require('../../constants/audit');
const actions = new Set(Object.values(AUDIT_ACTIONS));
const entities = new Set(Object.values(AUDIT_ENTITY_TYPES));
function normalizeQuery(params = {}) {
  const allowed = ['page', 'limit', 'search', 'action', 'actorUserId', 'entityType', 'entityId', 'startDate', 'endDate'];
  const invalid = () => { throw new ApiError(400, 'Invalid audit-log query'); };
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).some(key => !allowed.includes(key))) invalid();
  const integer = (value, max) => {
    if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > max) invalid();
    return Number(value);
  };
  const page = integer(params.page === undefined ? 1 : params.page, Number.MAX_SAFE_INTEGER);
  const limit = integer(params.limit === undefined ? 25 : params.limit, 100);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset + limit)) invalid();
  const filters = {};
  for (const key of ['actorUserId', 'entityId']) if (params[key] !== undefined) {
    const value = params[key];
    if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value)) || !/^[1-9]\d*$/.test(String(value)) || String(value).length > 20 || BigInt(value) > 18446744073709551615n) invalid();
    filters[key] = String(value);
  }
  for (const key of ['search', 'action', 'entityType']) if (params[key] !== undefined) {
    if (typeof params[key] !== 'string' || (key !== 'search' && !params[key].trim()) || params[key].trim().length > (key === 'search' ? 200 : 100)) invalid();
    if (key === 'search' && !params[key].trim()) continue;
    filters[key] = params[key].trim();
  }
  if (filters.action !== undefined && !actions.has(filters.action)) invalid();
  if (filters.entityType !== undefined && !entities.has(filters.entityType)) invalid();
  try {
    if (params.startDate !== undefined) filters.startAt = dateBoundary(params.startDate);
    if (params.endDate !== undefined) filters.endExclusive = dateBoundary(params.endDate, true);
  } catch { invalid(); }
  if (params.startDate && params.endDate && params.startDate > params.endDate) invalid();
  return { filters, page, limit, offset };
}
// Route-local validation status; unrelated endpoints keep their existing 422s.
function validateAuditQuery(req, res, next) {
  try { normalizeQuery(req.query); next(); } catch (error) { next(error); }
}
module.exports = { normalizeQuery, listValidation: [validateAuditQuery] };
