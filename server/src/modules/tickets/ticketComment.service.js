const ticketRepository = require("./ticket.repository");
const ticketCommentRepository = require("./ticketComment.repository");
const userRepository = require("../users/user.repository");
const { getCommentVisibilityOptions } = require("./ticketCommentAccess.service");
const { USER_ROLES } = require("../../constants/roles");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");
const { COMMENT_TYPES } = require("../../constants/commentTypes");
const ApiError = require("../../utils/ApiError");
const pool = require("../../config/database");
const notificationService = require("../notifications/notification.service");
const notificationRealtime = require("../notifications/notificationRealtime.service");
const { NOTIFICATION_TYPES } = require("../../constants/notificationTypes");

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
  const connection = await pool.getConnection();
  let commentId;
  try {
    await connection.beginTransaction();
    // Keep assignment and status checks valid until the reply commits.
    if (!(await ticketRepository.lockById(ticketId, connection))) {
      throw new ApiError(404, "Ticket not found");
    }
    const ticket = await ticketRepository.findById(ticketId, connection);
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
    commentId = await insertComment(ticketId, content, currentUser.id, COMMENT_TYPES.PUBLIC, connection);
    if ([USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN].includes(currentUser.role)) {
      await ticketRepository.setFirstResponseIfUnset(ticketId, connection);
    }
    const notification = await notifyComment(ticket, commentId, COMMENT_TYPES.PUBLIC, currentUser, connection);
    await connection.commit();
    if (notification) notificationRealtime.emitNotification(notification);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original error if rollback also fails.
    }
    throw error;
  } finally {
    connection.release();
  }
  return getCreatedComment(commentId);
}

async function createInternalNote(ticketId, content, currentUser) {
  if (!validId(ticketId)) throw new ApiError(400, "Ticket ID must be a positive integer");
  if (!currentUser || !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (![USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN].includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const connection = await pool.getConnection();
  let commentId;
  try {
    await connection.beginTransaction();
    if (!(await ticketRepository.lockById(ticketId, connection))) throw new ApiError(404, "Ticket not found");
    const ticket = await ticketRepository.findById(ticketId, connection);
    if (!ticket) throw new ApiError(404, "Ticket not found");
    if (currentUser.role === USER_ROLES.TECHNICIAN && String(ticket.assigned_to) !== String(currentUser.id)) {
      throw new ApiError(404, "Ticket not found");
    }
    if (ticket.status === TICKET_STATUSES.CLOSED) {
      throw new ApiError(409, "Internal notes cannot be added to a closed ticket");
    }
    commentId = await insertComment(ticketId, content, currentUser.id, COMMENT_TYPES.INTERNAL, connection);
    const notification = await notifyComment(ticket, commentId, COMMENT_TYPES.INTERNAL, currentUser, connection);
    await connection.commit();
    if (notification) notificationRealtime.emitNotification(notification);
  } catch (error) {
    try { await connection.rollback(); } catch {
      // Preserve the original failure if rollback also fails.
    }
    throw error;
  } finally {
    connection.release();
  }
  return getCreatedComment(commentId);
}

async function getTicketComments(ticketId, currentUser) {
  if (!validId(ticketId)) throw new ApiError(400, "Ticket ID must be a positive integer");
  if (!currentUser || !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const ticket = await ticketRepository.findById(ticketId);
  const visibilityOptions = getCommentVisibilityOptions(ticket, currentUser);
  const rows = await ticketCommentRepository.findByTicketId(ticketId, visibilityOptions);
  return rows.map(mapComment);
}

async function notifyComment(ticket, commentId, commentType, currentUser, db) {
  let userId;
  let type;
  let title;
  let message;
  if (commentType === COMMENT_TYPES.INTERNAL) {
    if (currentUser.role !== USER_ROLES.ADMIN || ticket.assigned_to == null) return;
    userId = ticket.assigned_to;
    // Never persist internal-note metadata in the creator's notification feed.
    if (String(userId) === String(ticket.created_by)) return;
    // A stale assignment must never send internal activity to a non-technician.
    const recipient = await userRepository.findById(userId, db);
    if (!recipient || recipient.role !== USER_ROLES.TECHNICIAN ||
        String(recipient.id) !== String(userId)) {
      throw new ApiError(500, "Internal notification recipient is inconsistent");
    }
    type = NOTIFICATION_TYPES.INTERNAL_NOTE;
    title = "New internal note";
    message = `A new internal note was added to ${ticket.ticket_number}.`;
  } else {
    const employeeReply = currentUser.role === USER_ROLES.EMPLOYEE;
    userId = employeeReply ? ticket.assigned_to : ticket.created_by;
    type = NOTIFICATION_TYPES.PUBLIC_COMMENT;
    title = employeeReply ? "New ticket reply" : "New support reply";
    message = employeeReply ? `A new reply was added to ${ticket.ticket_number}.`
      : `Support replied to ${ticket.ticket_number}.`;
  }
  if (userId == null || String(userId) === String(currentUser.id)) return;
  return notificationService.createNotification({
    userId, ticketId: ticket.id, commentId, type, title, message,
  }, db);
}

async function insertComment(ticketId, content, userId, commentType, db = pool) {
  if (typeof content !== "string") throw new ApiError(400, "Content must be a string");
  const trimmedContent = content.trim();
  const length = Array.from(trimmedContent).length;
  if (length < 1 || length > 5000) throw new ApiError(400, "Content must be 1 to 5000 characters");
  return ticketCommentRepository.createComment({
    ticketId, userId, commentType, content: trimmedContent,
  }, db);
}

async function getCreatedComment(commentId) {
  const row = await ticketCommentRepository.findById(commentId);
  if (!row) throw new ApiError(500, "Created comment could not be retrieved");
  return mapComment(row);
}

function mapComment(row) {
  return {
    id: row.id, ticketId: row.ticket_id, commentType: row.comment_type, content: row.content,
    createdAt: row.created_at, updatedAt: row.updated_at,
    author: {
      id: row.user_id, firstName: row.author_first_name, lastName: row.author_last_name,
      email: row.author_email, role: row.author_role, profileImageUrl: row.author_profile_image_url,
    },
  };
}

module.exports = { createPublicComment, createInternalNote, getTicketComments };
