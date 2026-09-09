const repository = require("./dashboard.repository");
const ApiError = require("../../utils/ApiError");

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

module.exports = { getEmployeeDashboardSummary, getTechnicianDashboardSummary, getAdminDashboardSummary };
