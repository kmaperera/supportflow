const repository = require("./dashboard.repository");
const ApiError = require("../../utils/ApiError");

async function getEmployeeDashboardSummary(userId, db) {
  if (!["string", "number"].includes(typeof userId) ||
      (typeof userId === "number" && !Number.isSafeInteger(userId)) ||
      !/^[1-9]\d*$/.test(String(userId)) || String(userId).length > 20 ||
      BigInt(userId) > 18446744073709551615n) throw new ApiError(422, "User ID must be a positive integer");
  const row = await repository.getEmployeeSummary(userId, db);
  return {
    totalTickets: Number(row.total_tickets ?? 0), openTickets: Number(row.open_tickets ?? 0),
    assignedTickets: Number(row.assigned_tickets ?? 0), inProgressTickets: Number(row.in_progress_tickets ?? 0),
    waitingForUserTickets: Number(row.waiting_for_user_tickets ?? 0), resolvedTickets: Number(row.resolved_tickets ?? 0),
    closedTickets: Number(row.closed_tickets ?? 0), reopenedTickets: Number(row.reopened_tickets ?? 0),
    activeTickets: Number(row.active_tickets ?? 0),
  };
}

module.exports = { getEmployeeDashboardSummary };
