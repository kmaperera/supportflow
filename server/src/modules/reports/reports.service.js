const pool = require("../../config/database");
const repository = require("./reports.repository");
const { normalizeReportQuery, dateBoundary, normalizeDateRangeQuery, parseCalendarDate, normalizePerformanceQuery, normalizeSlaReportQuery, normalizeCategoryReportQuery, normalizePriorityReportQuery } = require("./reports.validation");
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

async function getTechnicianPerformanceReport(params = {}, db) {
  const filters = normalizePerformanceQuery(params);
  const boundaries = {};
  if (filters.startDate) boundaries.startAt = dateBoundary(filters.startDate);
  if (filters.endDate) boundaries.endExclusive = dateBoundary(filters.endDate, true);
  const reads = [() => repository.getPerformanceTechnicians(db),
    () => repository.getTechnicianHistoricalCounts(boundaries, "assignment", db),
    () => repository.getTechnicianHistoricalCounts(boundaries, "resolution", db),
    () => repository.getTechnicianCompletionMetrics(boundaries, "response", db),
    () => repository.getTechnicianCompletionMetrics(boundaries, "resolution", db)];
  let results;
  if (db === undefined || db === pool) results = await Promise.all(reads.map(read => read()));
  else { results = []; for (const read of reads) results.push(await read()); }
  const [users, ...aggregates] = results;
  const [assignments, resolutions, responses, timings] = aggregates.map(rows => new Map(rows.map(row => [String(row.technician_id), row])));
  const minutes = row => Number(row?.samples ?? 0) === 0 || row.average_seconds == null ? null : Number((Number(row.average_seconds) / 60).toFixed(2));
  const completed = row => Number(row?.sla_met ?? 0) + Number(row?.sla_missed ?? 0);
  const percentage = row => completed(row) === 0 ? null : Number((Number(row.sla_met) / completed(row) * 100).toFixed(2));
  const technicians = users.map(user => {
    const key = String(user.id), response = responses.get(key), resolution = timings.get(key);
    return { technicianId: Number(user.id), technicianName: name(user.first_name, user.last_name), email: user.email,
      isActive: [true, 1, "1"].includes(user.is_active), assignedTickets: Number(assignments.get(key)?.ticket_count ?? 0),
      resolvedTickets: Number(resolutions.get(key)?.ticket_count ?? 0),
      averageFirstResponseMinutes: minutes(response), averageResolutionMinutes: minutes(resolution),
      responseSlaCompliancePercentage: percentage(response), resolutionSlaCompliancePercentage: percentage(resolution),
      firstResponseSamples: Number(response?.samples ?? 0), resolutionSamples: Number(resolution?.samples ?? 0),
      responseSlaCompletedTickets: completed(response), resolutionSlaCompletedTickets: completed(resolution) };
  });
  technicians.sort((a, b) => b.resolvedTickets - a.resolvedTickets || b.assignedTickets - a.assignedTickets ||
    a.technicianName.localeCompare(b.technicianName) || a.technicianId - b.technicianId);
  return { report: { filters, technicians } };
}

async function getSlaReport(params = {}, db) {
  const filters = normalizeSlaReportQuery(params);
  const queryFilters = { ...filters };
  delete queryFilters.startDate;
  delete queryFilters.endDate;
  if (filters.startDate) queryFilters.startAt = dateBoundary(filters.startDate);
  if (filters.endDate) queryFilters.endExclusive = dateBoundary(filters.endDate, true);
  const row = await repository.getSlaReportMetrics({ filters: queryFilters }, db);
  const metrics = dimension => {
    const metTickets = Number(row[`${dimension}_met`] ?? 0);
    const missedTickets = Number(row[`${dimension}_missed`] ?? 0);
    const pendingTickets = Number(row[`${dimension}_pending`] ?? 0);
    const completedTickets = metTickets + missedTickets;
    return { trackedTickets: Number(row[`${dimension}_tracked`] ?? 0), metTickets, missedTickets, pendingTickets, completedTickets,
      compliancePercentage: completedTickets === 0 ? null : Number((metTickets / completedTickets * 100).toFixed(2)) };
  };
  return { report: { filters, responseSla: metrics("response"), resolutionSla: metrics("resolution") } };
}

async function getCategoryReport(params = {}, db) {
  const filters = normalizeCategoryReportQuery(params);
  const queryFilters = { ...filters };
  delete queryFilters.startDate;
  delete queryFilters.endDate;
  if (filters.startDate) queryFilters.startAt = dateBoundary(filters.startDate);
  if (filters.endDate) queryFilters.endExclusive = dateBoundary(filters.endDate, true);
  const rows = await repository.getCategoryReport({ filters: queryFilters }, db);
  // Sum grouped counts, not ticket rows: the category FK makes this the complete
  // population, and one read keeps the denominator consistent during ticket writes.
  const totalTickets = rows.reduce((sum, row) => sum + Number(row.total_tickets ?? 0), 0);
  const categories = rows.map(row => {
    const total = Number(row.total_tickets ?? 0);
    return { categoryId: Number(row.category_id), categoryName: row.category_name,
      isActive: [true, 1, "1"].includes(row.is_active), totalTickets: total,
      activeTickets: Number(row.active_tickets ?? 0), resolvedTickets: Number(row.resolved_tickets ?? 0),
      closedTickets: Number(row.closed_tickets ?? 0), percentageOfTickets: totalTickets === 0 ? 0 : Number((total / totalTickets * 100).toFixed(2)) };
  });
  return { report: { filters, totalTickets, categories } };
}

async function getPriorityReport(params = {}, db) {
  const filters = normalizePriorityReportQuery(params);
  const queryFilters = { ...filters };
  delete queryFilters.startDate;
  delete queryFilters.endDate;
  if (filters.startDate) queryFilters.startAt = dateBoundary(filters.startDate);
  if (filters.endDate) queryFilters.endExclusive = dateBoundary(filters.endDate, true);
  const rows = await repository.getPriorityReport({ filters: queryFilters }, db);
  // Sum grouped counts, not ticket rows: the priority FK makes this the complete
  // population, and one read keeps the denominator consistent during ticket writes.
  const totalTickets = rows.reduce((sum, row) => sum + Number(row.total_tickets ?? 0), 0);
  const priorities = rows.map(row => {
    const total = Number(row.total_tickets ?? 0);
    return { priorityId: Number(row.priority_id), priorityName: row.priority_name,
      totalTickets: total,
      activeTickets: Number(row.active_tickets ?? 0), resolvedTickets: Number(row.resolved_tickets ?? 0),
      closedTickets: Number(row.closed_tickets ?? 0), percentageOfTickets: totalTickets === 0 ? 0 : Number((total / totalTickets * 100).toFixed(2)) };
  });
  // Canonical seeded names determine severity, never numeric database IDs.
  const severity = new Map([["CRITICAL", 1], ["HIGH", 2], ["MEDIUM", 3], ["LOW", 4]]);
  const rank = row => severity.get(row.priorityName.trim().toUpperCase()) ?? 5;
  priorities.sort((a, b) => rank(a) - rank(b) || a.priorityName.localeCompare(b.priorityName) || a.priorityId - b.priorityId);
  return { report: { filters, totalTickets, priorities } };
}

module.exports = { getTicketReportQuery, getDateRangeReport, getTechnicianPerformanceReport, getSlaReport, getCategoryReport, getPriorityReport };
