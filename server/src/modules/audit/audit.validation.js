const ApiError = require('../../utils/ApiError');
const { query } = require('express-validator');
const { dateBoundary } = require('../reports/reports.validation');
function normalizeQuery(params = {}) {
  const allowed = ['page', 'limit', 'search', 'action', 'actorUserId', 'entityType', 'entityId', 'startDate', 'endDate'];
  const invalid = () => { throw new ApiError(422, 'Invalid audit-log query'); };
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).some(key => !allowed.includes(key))) invalid();
  const integer = (value, max) => {
    if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > max) invalid();
    return Number(value);
  };
  const page = integer(params.page ?? 1, Number.MAX_SAFE_INTEGER);
  const limit = integer(params.limit ?? 25, 100);
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
  if (params.startDate !== undefined) filters.startAt = dateBoundary(params.startDate);
  if (params.endDate !== undefined) filters.endExclusive = dateBoundary(params.endDate, true);
  if (params.startDate && params.endDate && params.startDate > params.endDate) invalid();
  return { filters, page, limit, offset };
}
module.exports = { normalizeQuery, listValidation: [query().custom(value => { normalizeQuery(value); return true; })] };
