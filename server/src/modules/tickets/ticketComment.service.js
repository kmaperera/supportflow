const ticketRepository = require("./ticket.repository");
const ticketCommentRepository = require("./ticketComment.repository");
const { USER_ROLES } = require("../../constants/roles");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");
const { COMMENT_TYPES } = require("../../constants/commentTypes");
const ApiError = require("../../utils/ApiError");

function validId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
}

async function createPublicComment(ticketId, content, currentUser) {
  if (!validId(ticketId)) throw new ApiError(400, "Ticket ID must be a positive integer");
  if (!currentUser || !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const userId = String(currentUser.id);
  const allowed = currentUser.role === USER_ROLES.ADMIN ||
    (currentUser.role === USER_ROLES.EMPLOYEE && String(ticket.created_by) === userId) ||
    (currentUser.role === USER_ROLES.TECHNICIAN && String(ticket.assigned_to) === userId);
  if (!allowed) throw new ApiError(404, "Ticket not found");
  if (![TICKET_STATUSES.OPEN, TICKET_STATUSES.ASSIGNED, TICKET_STATUSES.IN_PROGRESS,
    TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.REOPENED].includes(ticket.status)) {
    throw new ApiError(409, "Comments cannot be added in the ticket's current status");
  }
  return createComment(ticketId, content, currentUser.id, COMMENT_TYPES.PUBLIC);
}

async function createInternalNote(ticketId, content, currentUser) {
  if (!validId(ticketId)) throw new ApiError(400, "Ticket ID must be a positive integer");
  if (!currentUser || !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (![USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN].includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  if (currentUser.role === USER_ROLES.TECHNICIAN &&
      String(ticket.assigned_to) !== String(currentUser.id)) {
    throw new ApiError(404, "Ticket not found");
  }
  if (ticket.status === TICKET_STATUSES.CLOSED) {
    throw new ApiError(409, "Internal notes cannot be added to a closed ticket");
  }
  return createComment(ticketId, content, currentUser.id, COMMENT_TYPES.INTERNAL);
}

async function createComment(ticketId, content, userId, commentType) {
  if (typeof content !== "string") throw new ApiError(400, "Content must be a string");
  const trimmedContent = content.trim();
  const length = Array.from(trimmedContent).length;
  if (length < 1 || length > 5000) throw new ApiError(400, "Content must be 1 to 5000 characters");
  const commentId = await ticketCommentRepository.createComment({
    ticketId, userId, commentType, content: trimmedContent,
  });
  const row = await ticketCommentRepository.findById(commentId);
  if (!row) throw new ApiError(500, "Created comment could not be retrieved");
  return {
    id: row.id, ticketId: row.ticket_id, commentType: row.comment_type, content: row.content,
    createdAt: row.created_at, updatedAt: row.updated_at,
    author: {
      id: row.user_id, firstName: row.author_first_name, lastName: row.author_last_name,
      email: row.author_email, role: row.author_role, profileImageUrl: row.author_profile_image_url,
    },
  };
}

module.exports = { createPublicComment, createInternalNote };
