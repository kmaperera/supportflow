const { TICKET_STATUSES } = require("../constants/ticketStatuses");
const ApiError = require("./ApiError");

const validStatuses = new Set(Object.values(TICKET_STATUSES));

const transitions = Object.freeze({
  [TICKET_STATUSES.OPEN]: Object.freeze([TICKET_STATUSES.ASSIGNED]),
  [TICKET_STATUSES.ASSIGNED]: Object.freeze([TICKET_STATUSES.IN_PROGRESS]),
  [TICKET_STATUSES.IN_PROGRESS]: Object.freeze([
    TICKET_STATUSES.WAITING_FOR_USER,
    TICKET_STATUSES.RESOLVED,
  ]),
  [TICKET_STATUSES.WAITING_FOR_USER]: Object.freeze([
    TICKET_STATUSES.IN_PROGRESS,
    TICKET_STATUSES.RESOLVED,
  ]),
  [TICKET_STATUSES.RESOLVED]: Object.freeze([
    TICKET_STATUSES.CLOSED,
    TICKET_STATUSES.REOPENED,
  ]),
  [TICKET_STATUSES.CLOSED]: Object.freeze([]),
  [TICKET_STATUSES.REOPENED]: Object.freeze([TICKET_STATUSES.IN_PROGRESS]),
});

function isValidTicketStatus(status) {
  return validStatuses.has(status);
}

function assertValidCurrentStatus(currentStatus) {
  if (!isValidTicketStatus(currentStatus)) {
    throw new Error("Invalid current ticket status: persisted ticket status must be valid");
  }
}

function canTransitionTicketStatus(currentStatus, nextStatus) {
  if (!isValidTicketStatus(currentStatus) || !isValidTicketStatus(nextStatus)) {
    return false;
  }

  return currentStatus !== nextStatus && transitions[currentStatus].includes(nextStatus);
}

function assertTicketStatusTransition(currentStatus, nextStatus) {
  assertValidCurrentStatus(currentStatus);

  if (!isValidTicketStatus(nextStatus)) {
    throw new ApiError(400, "Invalid ticket status");
  }

  if (currentStatus === nextStatus) {
    throw new ApiError(409, "Ticket is already in the requested status");
  }

  if (!canTransitionTicketStatus(currentStatus, nextStatus)) {
    throw new ApiError(
      409,
      `Cannot change ticket status from ${currentStatus} to ${nextStatus}`
    );
  }

  return true;
}

function getAllowedNextStatuses(currentStatus) {
  assertValidCurrentStatus(currentStatus);
  return [...transitions[currentStatus]];
}

module.exports = {
  isValidTicketStatus,
  canTransitionTicketStatus,
  assertTicketStatusTransition,
  getAllowedNextStatuses,
};
