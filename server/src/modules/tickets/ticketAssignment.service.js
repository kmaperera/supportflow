const repository = require("./ticketAssignment.repository");
const ApiError = require("../../utils/ApiError");

function validId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
}

// Write workflows must hold the ticket row lock and pass their transaction connection.
async function assertAssignmentConsistency(ticket, db) {
  const inconsistent = () => new ApiError(500, "Ticket assignment data is inconsistent");
  if (!ticket || typeof ticket !== "object" || Array.isArray(ticket) ||
      !validId(ticket.id) || (ticket.assigned_to !== null && !validId(ticket.assigned_to))) {
    throw inconsistent();
  }
  const activeAssignments = await repository.findActiveAssignmentsByTicketId(ticket.id, db);
  if (ticket.assigned_to === null) {
    if (activeAssignments.length !== 0) throw inconsistent();
    return { isAssigned: false, activeAssignment: null };
  }
  if (activeAssignments.length !== 1 ||
      !validId(activeAssignments[0].technician_id) ||
      String(activeAssignments[0].technician_id) !== String(ticket.assigned_to)) {
    throw inconsistent();
  }
  return { isAssigned: true, activeAssignment: activeAssignments[0] };
}

async function assertCanCreateAssignment(ticket, db) {
  const state = await assertAssignmentConsistency(ticket, db);
  if (state.isAssigned) throw new ApiError(409, "Ticket is already assigned");
  return state;
}

async function assertCanChangeAssignment(ticket, db) {
  const state = await assertAssignmentConsistency(ticket, db);
  return state.activeAssignment;
}

async function assertCanUnassign(ticket, db) {
  const state = await assertAssignmentConsistency(ticket, db);
  if (!state.isAssigned) throw new ApiError(409, "Ticket is already unassigned");
  return state.activeAssignment;
}

module.exports = {
  assertAssignmentConsistency, assertCanCreateAssignment, assertCanChangeAssignment, assertCanUnassign,
};
