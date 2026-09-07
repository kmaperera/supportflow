const { USER_ROLES } = require("../../constants/roles");
const ApiError = require("../../utils/ApiError");

function validId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
}

function assertCanViewTicketComments(ticket, currentUser) {
  if (!currentUser || typeof currentUser !== "object" || Array.isArray(currentUser) ||
      !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  if (!ticket || typeof ticket !== "object" || Array.isArray(ticket) ||
      !validId(ticket.id) || !validId(ticket.created_by) ||
      (ticket.assigned_to !== null && !validId(ticket.assigned_to))) {
    throw new ApiError(404, "Ticket not found");
  }

  const userId = String(currentUser.id);
  const allowed = currentUser.role === USER_ROLES.ADMIN ||
    (currentUser.role === USER_ROLES.EMPLOYEE && String(ticket.created_by) === userId) ||
    (currentUser.role === USER_ROLES.TECHNICIAN &&
      (ticket.assigned_to === null || String(ticket.assigned_to) === userId));
  if (!allowed) throw new ApiError(404, "Ticket not found");
  return true;
}

function canViewInternalComments(currentUser) {
  return Boolean(currentUser && typeof currentUser === "object" && !Array.isArray(currentUser) &&
    validId(currentUser.id) && [USER_ROLES.ADMIN, USER_ROLES.TECHNICIAN].includes(currentUser.role));
}

function getCommentVisibilityOptions(ticket, currentUser) {
  assertCanViewTicketComments(ticket, currentUser);
  const includeInternal = canViewInternalComments(currentUser);
  return { includeInternal };
}

module.exports = { assertCanViewTicketComments, canViewInternalComments, getCommentVisibilityOptions };
