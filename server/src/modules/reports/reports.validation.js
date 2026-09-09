const { query } = require("express-validator");
const ApiError = require("../../utils/ApiError");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");
const { REPORT_FILTERS, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require("./reports.constants");

function invalid(message) { throw new ApiError(422, message); }
function parseCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid("Dates must use YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (year < 1000 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) invalid("Invalid calendar date");
  return date;
}
function dateBoundary(value, exclusive = false) {
  const date = parseCalendarDate(value);
  if (exclusive) date.setUTCDate(date.getUTCDate() + 1);
  if (date.getUTCFullYear() > 9999) invalid("End date exceeds supported range");
  return `${date.toISOString().slice(0, 10)} 00:00:00`;
}
function positiveInteger(value, name, max = Number.MAX_SAFE_INTEGER) {
  if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value)) || Number(value) > max) invalid(`${name} must be a positive integer no greater than ${max}`);
  return Number(value);
}
function normalizeReportQuery(params = {}, allowedFilters = REPORT_FILTERS) {
  if (!Array.isArray(allowedFilters) || allowedFilters.some(key => !REPORT_FILTERS.includes(key))) throw new TypeError("Unsupported report filter configuration");
  if (!params || typeof params !== "object" || Array.isArray(params) || Object.keys(params).some(key => ![...allowedFilters, "page", "limit"].includes(key))) invalid("Unsupported report query parameter");
  const filters = {};
  for (const key of allowedFilters) {
    if (params[key] === undefined) continue;
    if (key === "startDate" || key === "endDate") {
      dateBoundary(params[key], key === "endDate");
      filters[key] = params[key];
    } else if (key === "status") {
      if (!Object.values(TICKET_STATUSES).includes(params[key])) invalid("Invalid ticket status");
      filters[key] = params[key];
    } else filters[key] = positiveInteger(params[key], key);
  }
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) invalid("startDate must not be after endDate");
  const page = positiveInteger(params.page === undefined ? DEFAULT_PAGE : params.page, "page");
  const limit = positiveInteger(params.limit === undefined ? DEFAULT_LIMIT : params.limit, "limit", MAX_LIMIT);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + limit)) invalid("Pagination offset exceeds supported range");
  return { filters, pagination: { page, limit, offset } };
}
function reportQueryValidation(allowedFilters = REPORT_FILTERS) {
  return [query().custom(value => { normalizeReportQuery(value, allowedFilters); return true; })];
}
function normalizeDateRangeQuery(params = {}) {
  if (!params || typeof params !== "object" || Array.isArray(params) ||
      Object.keys(params).some(key => !["startDate", "endDate"].includes(key))) invalid("Only startDate and endDate are supported");
  if (params.startDate === undefined || params.endDate === undefined) invalid("startDate and endDate are required");
  return normalizeReportQuery(params, ["startDate", "endDate"]).filters;
}
const dateRangeValidation = [query().custom(value => { normalizeDateRangeQuery(value); return true; })];

module.exports = { parseCalendarDate, dateBoundary, normalizeReportQuery, reportQueryValidation, normalizeDateRangeQuery, dateRangeValidation };
