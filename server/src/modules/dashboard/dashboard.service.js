const pool = require("../../config/database");
const ticketFeedbackRepository = require("../ticketFeedback/ticketFeedback.repository");
const repository = require("./dashboard.repository");
const ApiError = require("../../utils/ApiError");
const { USER_ROLES } = require("../../constants/roles");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");

function validateUserId(userId) {
  if (!["string", "number"].includes(typeof userId) ||
      (typeof userId === "number" && !Number.isSafeInteger(userId)) ||
      !/^[1-9]\d*$/.test(String(userId)) || String(userId).length > 20 ||
      BigInt(userId) > 18446744073709551615n) throw new ApiError(422, "User ID must be a positive integer");
}

async function getEmployeeDashboardSummary(userId, db) {
  validateUserId(userId);
  const row = await repository.getEmployeeSummary(userId, db);
  return mapTicketSummary(row);
}

function mapTicketSummary(row) {
  return {
    totalTickets: Number(row.total_tickets ?? 0), openTickets: Number(row.open_tickets ?? 0),
    assignedTickets: Number(row.assigned_tickets ?? 0), inProgressTickets: Number(row.in_progress_tickets ?? 0),
    waitingForUserTickets: Number(row.waiting_for_user_tickets ?? 0), resolvedTickets: Number(row.resolved_tickets ?? 0),
    closedTickets: Number(row.closed_tickets ?? 0), reopenedTickets: Number(row.reopened_tickets ?? 0),
    activeTickets: Number(row.active_tickets ?? 0),
  };
}

// Pool queries may use separate connections. Injected connections remain sequential,
// including transaction connections whose statements must not overlap.
async function independentReads(reads, db) {
  if (db === undefined || db === pool) return Promise.all(reads.map(read => read()));
  const results = [];
  for (const read of reads) results.push(await read());
  return results;
}

async function getTechnicianDashboardSummary(technicianId, db) {
  validateUserId(technicianId);
  const [row, queueCount] = await independentReads([
    () => repository.getTechnicianSummary(technicianId, db),
    () => repository.countUnassignedQueue(db),
  ], db);
  return {
    assignedTickets: Number(row.assigned_tickets ?? 0), inProgressTickets: Number(row.in_progress_tickets ?? 0),
    waitingForUserTickets: Number(row.waiting_for_user_tickets ?? 0), reopenedTickets: Number(row.reopened_tickets ?? 0),
    resolvedTickets: Number(row.resolved_tickets ?? 0), activeAssignedTickets: Number(row.active_assigned_tickets ?? 0),
    unassignedQueueTickets: Number(queueCount ?? 0),
  };
}

async function getAdminDashboardSummary(db) {
  const [tickets, unassigned, users] = await independentReads([
    () => repository.getAdminTicketSummary(db),
    () => repository.countUnassignedQueue(db),
    () => repository.getAdminUserSummary(db),
  ], db);
  return {
    ...mapTicketSummary(tickets), unassignedTickets: Number(unassigned ?? 0),
    totalEmployees: Number(users.total_employees ?? 0), activeEmployees: Number(users.active_employees ?? 0),
    totalTechnicians: Number(users.total_technicians ?? 0), activeTechnicians: Number(users.active_technicians ?? 0),
  };
}

async function getTicketSummaryCards(user, db) {
  if (!user) throw new ApiError(401, "Authentication required");
  if (!Object.values(USER_ROLES).includes(user.role)) throw new ApiError(403, "You do not have permission to access this resource");
  validateUserId(user.id);
  let summary;
  let cards;
  if (user.role === USER_ROLES.EMPLOYEE) {
    summary = await getEmployeeDashboardSummary(user.id, db);
    cards = [["totalTickets", "Total Tickets"], ["activeTickets", "Active Tickets"],
      ["resolvedTickets", "Resolved Tickets"], ["closedTickets", "Closed Tickets"]];
  } else if (user.role === USER_ROLES.TECHNICIAN) {
    summary = await getTechnicianDashboardSummary(user.id, db);
    cards = [["activeAssignedTickets", "Active Assigned"], ["assignedTickets", "Assigned"],
      ["waitingForUserTickets", "Waiting for User"], ["unassignedQueueTickets", "Unassigned Queue"]];
  } else {
    summary = await getAdminDashboardSummary(db);
    cards = [["totalTickets", "Total Tickets"], ["activeTickets", "Active Tickets"],
      ["unassignedTickets", "Unassigned Tickets"], ["resolvedTickets", "Resolved Tickets"]];
  }
  return cards.map(([key, label]) => ({ key, label, value: summary[key] }));
}

function distributionScope(user) {
  if (!user) throw new ApiError(401, "Authentication required");
  if (!Object.values(USER_ROLES).includes(user.role)) throw new ApiError(403, "You do not have permission to access this resource");
  validateUserId(user.id);
  return user.role === USER_ROLES.EMPLOYEE ? { createdBy: user.id }
    : user.role === USER_ROLES.TECHNICIAN ? { assignedTo: user.id } : {};
}

async function getTicketStatusDistribution(user, db) {
  const filters = distributionScope(user);
  const rows = await repository.getTicketStatusDistribution(filters, db);
  const counts = new Map(rows.map(row => [row.status, Number(row.count ?? 0)]));
  return [TICKET_STATUSES.OPEN, TICKET_STATUSES.ASSIGNED, TICKET_STATUSES.IN_PROGRESS,
    TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.RESOLVED, TICKET_STATUSES.CLOSED,
    TICKET_STATUSES.REOPENED].map(status => ({ status, count: counts.get(status) ?? 0 }));
}

async function getTicketCategoryDistribution(user, db) {
  const rows = await repository.getTicketCategoryDistribution(distributionScope(user), db);
  return rows.map(row => ({ categoryId: Number(row.category_id), categoryName: row.category_name, count: Number(row.count ?? 0) }));
}

async function getTicketPriorityDistribution(user, db) {
  const rows = await repository.getTicketPriorityDistribution(distributionScope(user), db);
  const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const priorities = new Map();
  for (const row of rows) {
    const name = row.priority_name.trim().toUpperCase();
    if (!order.includes(name) || priorities.has(name)) throw new ApiError(409, "Unexpected ticket priority configuration");
    priorities.set(name, { priorityId: Number(row.priority_id), priorityName: name, count: Number(row.count ?? 0) });
  }
  if (order.some(name => !priorities.has(name))) throw new ApiError(409, "Ticket priority configuration is incomplete");
  return order.map(name => priorities.get(name));
}

async function getTechnicianWorkloadAnalytics(db) {
  const rows = await repository.getTechnicianWorkloadAnalytics(db);
  return rows.map(row => ({
    technicianId: Number(row.technician_id),
    technicianName: [row.first_name, row.last_name].map(name => (name ?? "").trim()).filter(Boolean).join(" "),
    email: row.email, isActive: [true, 1, "1"].includes(row.is_active),
    assignedTickets: Number(row.assigned_tickets ?? 0), inProgressTickets: Number(row.in_progress_tickets ?? 0),
    waitingForUserTickets: Number(row.waiting_for_user_tickets ?? 0), reopenedTickets: Number(row.reopened_tickets ?? 0),
    activeTickets: Number(row.active_tickets ?? 0), resolvedTickets: Number(row.resolved_tickets ?? 0),
  }));
}

function averageSecondsToMinutes(seconds, sampleCount) {
  return sampleCount === 0 || seconds == null ? null : Number((Number(seconds) / 60).toFixed(2));
}

async function getAverageFirstResponseTime(user, db) {
  const row = await repository.getAverageFirstResponseTime(distributionScope(user), db);
  const respondedTickets = Number(row.responded_tickets ?? 0);
  return {
    averageFirstResponseMinutes: averageSecondsToMinutes(row.average_first_response_seconds, respondedTickets),
    respondedTickets,
  };
}

async function getAverageResolutionTime(user, db) {
  const row = await repository.getAverageResolutionTime(distributionScope(user), db);
  const resolvedTickets = Number(row.resolved_tickets ?? 0);
  return {
    averageResolutionMinutes: averageSecondsToMinutes(row.average_resolution_seconds, resolvedTickets),
    resolvedTickets,
  };
}

function mapSlaCompliance(row, dimension) {
  const trackedTickets = Number(row[`${dimension}_tracked`] ?? 0);
  const metTickets = Number(row[`${dimension}_met`] ?? 0);
  const missedTickets = Number(row[`${dimension}_missed`] ?? 0);
  const pendingTickets = Number(row[`${dimension}_pending`] ?? 0);
  const completedTickets = metTickets + missedTickets;
  return {
    trackedTickets, metTickets, missedTickets, pendingTickets, completedTickets,
    compliancePercentage: completedTickets === 0 ? null : Number((metTickets / completedTickets * 100).toFixed(2)),
  };
}

async function getSlaComplianceMetrics(user, db) {
  const row = await repository.getSlaComplianceMetrics(distributionScope(user), db);
  return { response: mapSlaCompliance(row, "response"), resolution: mapSlaCompliance(row, "resolution") };
}

async function getTicketTrend(user, period = "monthly", db, now = new Date()) {
  if (!["daily", "monthly"].includes(period)) throw new ApiError(422, "Period must be daily or monthly");
  const scope = distributionScope(user);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const daily = period === "daily";
  const length = daily ? 30 : 12;
  const dates = Array.from({ length }, (_, index) => new Date(daily
    ? Date.UTC(year, month, day - 29 + index) : Date.UTC(year, month - 11 + index, 1)));
  const end = new Date(daily ? Date.UTC(year, month, day + 1) : Date.UTC(year, month + 1, 1));
  // Bind UTC calendar strings, avoiding mysql2's local-time serialization of JS Dates.
  const boundary = date => `${date.toISOString().slice(0, 10)} 00:00:00`;
  const rows = await repository.getTicketTrend({ ...scope, period,
    startDate: boundary(dates[0]), endDate: boundary(end) }, db);
  const counts = new Map(rows.map(row => [row.period_key, Number(row.ticket_count ?? 0)]));
  const trend = dates.map(date => {
    const key = date.toISOString().slice(0, daily ? 10 : 7);
    return { [daily ? "date" : "month"]: key, count: counts.get(key) ?? 0 };
  });
  return { period, trend };
}

async function getRecentTickets(user, limit = 5, db) {
  const scope = distributionScope(user);
  if (!["string", "number"].includes(typeof limit) || !/^(?:[1-9]|10)$/.test(String(limit))) {
    throw new ApiError(422, "Limit must be an integer from 1 to 10");
  }
  const rows = await repository.getRecentTickets({ ...scope, limit: Number(limit) }, db);
  return rows.map(row => ({
    id: Number(row.id), ticketNumber: row.ticket_number, title: row.title,
    status: row.status, createdAt: row.created_at,
    priority: { id: Number(row.priority_id), name: row.priority_name },
    category: { id: Number(row.category_id), name: row.category_name },
  }));
}

async function getRecentTicketActivity(user, limit = 10, db) {
  const scope = distributionScope(user);
  if (!["string", "number"].includes(typeof limit) || !/^(?:[1-9]|1[0-9]|20)$/.test(String(limit))) {
    throw new ApiError(422, "Limit must be an integer from 1 to 20");
  }
  const includeInternal = require("../tickets/ticketCommentAccess.service").canViewInternalComments(user);
  const sources = ["status", "assignment", "assignmentEnd", "comment"];
  const batches = await independentReads(sources.map(source => () => repository.getRecentActivitySource(source,
    { ...scope, includeInternal, limit: Number(limit) }, db)), db);
  const events = batches.flatMap((rows, rank) => rows
    .filter(row => sources[rank] !== "comment" || row.comment_type === "PUBLIC" || (includeInternal && row.comment_type === "INTERNAL"))
    .map(row => ({ row, source: sources[rank], rank })));
  events.sort((a, b) => new Date(b.row.created_at) - new Date(a.row.created_at) || a.rank - b.rank ||
    (BigInt(a.row.event_id) === BigInt(b.row.event_id) ? 0 : BigInt(a.row.event_id) > BigInt(b.row.event_id) ? -1 : 1));
  return events.slice(0, Number(limit)).map(({ row, source }) => {
    const activity = {
      type: source === "status" ? "STATUS_CHANGED" : source === "assignment" ? "ASSIGNED"
        : source === "assignmentEnd" ? "ASSIGNMENT_ENDED" : row.comment_type === "PUBLIC" ? "PUBLIC_COMMENT" : "INTERNAL_NOTE",
      ticketId: Number(row.ticket_id), ticketNumber: row.ticket_number, ticketTitle: row.ticket_title,
      message: source === "status" ? `Ticket status changed from ${row.from_status} to ${row.to_status}`
        : source === "assignment" ? "Ticket was assigned" : source === "assignmentEnd" ? "Ticket assignment ended"
          : row.comment_type === "PUBLIC" ? "A public reply was added" : "An internal note was added",
      actor: row.actor_id == null ? null : { id: Number(row.actor_id),
        name: [row.actor_first_name, row.actor_last_name].map(name => (name ?? "").trim()).filter(Boolean).join(" ") },
      createdAt: row.created_at,
    };
    if (source === "status") { activity.oldStatus = row.from_status; activity.newStatus = row.to_status; }
    // SELF/ADMIN describes the assignment method, not whether it was a reassignment.
    // unassigned_at also closes assignments on reassignment and records no ending actor.
    if (source === "assignment" || source === "assignmentEnd") activity.technicianId = Number(row.technician_id);
    if (source === "assignment") activity.assignmentType = row.assignment_type;
    return activity;
  });
}

async function getSatisfactionSummary(db) {
  const row = await ticketFeedbackRepository.getSatisfactionSummary(db);
  const totalRatings = Number(row.total_ratings ?? 0);
  const satisfiedRatings = Number(row.satisfied_ratings ?? 0);
  return {
    totalRatings,
    averageRating: totalRatings === 0 || row.average_rating == null ? null : Number(Number(row.average_rating).toFixed(2)),
    satisfiedRatings,
    satisfactionPercentage: totalRatings === 0 ? null : Number((satisfiedRatings / totalRatings * 100).toFixed(2)),
    ratingDistribution: [5, 4, 3, 2, 1].map(rating => ({ rating, count: Number(row[`rating_${rating}`] ?? 0) })),
  };
}

module.exports = { getEmployeeDashboardSummary, getTechnicianDashboardSummary, getAdminDashboardSummary, getTicketSummaryCards, getTicketStatusDistribution, getTicketCategoryDistribution, getTicketPriorityDistribution, getTechnicianWorkloadAnalytics, getAverageFirstResponseTime, getAverageResolutionTime, getSlaComplianceMetrics, getTicketTrend, getRecentTickets, getRecentTicketActivity, getSatisfactionSummary };
