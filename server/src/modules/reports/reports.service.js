const pool = require("../../config/database");
const repository = require("./reports.repository");
const { normalizeReportQuery, dateBoundary, normalizeDateRangeQuery, parseCalendarDate } = require("./reports.validation");
const name = (first, last) => [first, last].map(value => (value ?? "").trim()).filter(Boolean).join(" ");
async function getTicketReportQuery(params, db) {
  const { filters, pagination } = normalizeReportQuery(params);
  const queryFilters = { ...filters };
  delete queryFilters.startDate;
  delete queryFilters.endDate;
  if (filters.startDate !== undefined) queryFilters.startAt = dateBoundary(filters.startDate);
  if (filters.endDate !== undefined) queryFilters.endExclusive = dateBoundary(filters.endDate, true);
  const options = { filters: queryFilters, pagination };
  let rows, count;
  if (db === undefined || db === pool) {
    [rows, count] = await Promise.all([repository.getTicketReportRows(options, db), repository.countTicketReportRows(options, db)]);
  } else {
    rows = await repository.getTicketReportRows(options, db);
    count = await repository.countTicketReportRows(options, db);
  }
  const totalItems = Number(count);
  return { report: { filters, pagination: { page: pagination.page, limit: pagination.limit,
    totalItems, totalPages: Math.ceil(totalItems / pagination.limit) },
    rows: rows.map(row => ({ id: Number(row.id), ticketNumber: row.ticket_number, title: row.title, status: row.status,
      category: { id: Number(row.category_id), name: row.category_name },
      priority: { id: Number(row.priority_id), name: row.priority_name },
      requester: { id: Number(row.created_by), name: name(row.requester_first_name, row.requester_last_name), email: row.requester_email },
      assignedTechnician: row.assigned_to == null ? null : { id: Number(row.assigned_to), name: name(row.technician_first_name, row.technician_last_name), email: row.technician_email },
      createdAt: row.created_at, firstResponseAt: row.first_response_at, resolvedAt: row.resolved_at,
      responseDueAt: row.response_due_at, resolutionDueAt: row.resolution_due_at })),
  } };
}
async function getDateRangeReport(params, db) {
  const range = normalizeDateRangeQuery(params);
  const rows = await repository.getDailyTicketCountsInDateRange({
    startDateTime: dateBoundary(range.startDate), endExclusiveDateTime: dateBoundary(range.endDate, true),
  }, db);
  const counts = new Map(rows.map(row => [row.report_date, Number(row.ticket_count ?? 0)]));
  const dailyBreakdown = [];
  const date = parseCalendarDate(range.startDate);
  const end = parseCalendarDate(range.endDate);
  let totalTickets = 0;
  for (; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    const ticketCount = counts.get(key) ?? 0;
    dailyBreakdown.push({ date: key, ticketCount });
    totalTickets += ticketCount;
  }
  // Sum SQL-aggregated daily counts from one read so concurrent ticket creation cannot
  // make a separately read total disagree with the breakdown. No ticket rows are loaded.
  return { report: { range, totalTickets, dailyBreakdown } };
}

module.exports = { getTicketReportQuery, getDateRangeReport };
