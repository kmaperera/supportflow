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

async function getTechnicianDashboardSummary(technicianId, db) {
  validateUserId(technicianId);
  const row = await repository.getTechnicianSummary(technicianId, db);
  const queueCount = await repository.countUnassignedQueue(db);
  return {
    assignedTickets: Number(row.assigned_tickets ?? 0), inProgressTickets: Number(row.in_progress_tickets ?? 0),
    waitingForUserTickets: Number(row.waiting_for_user_tickets ?? 0), reopenedTickets: Number(row.reopened_tickets ?? 0),
    resolvedTickets: Number(row.resolved_tickets ?? 0), activeAssignedTickets: Number(row.active_assigned_tickets ?? 0),
    unassignedQueueTickets: Number(queueCount ?? 0),
  };
}

async function getAdminDashboardSummary(db) {
  const tickets = await repository.getAdminTicketSummary(db);
  const unassigned = await repository.countUnassignedQueue(db);
  const users = await repository.getAdminUserSummary(db);
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

module.exports = { getEmployeeDashboardSummary, getTechnicianDashboardSummary, getAdminDashboardSummary, getTicketSummaryCards, getTicketStatusDistribution, getTicketCategoryDistribution, getTicketPriorityDistribution, getTechnicianWorkloadAnalytics, getAverageFirstResponseTime, getAverageResolutionTime, getSlaComplianceMetrics };
