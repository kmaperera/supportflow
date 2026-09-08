const { getCommentVisibilityOptions } = require("./ticketCommentAccess.service");
const { USER_ROLES } = require("../../constants/roles");
const { COMMENT_TYPES } = require("../../constants/commentTypes");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");
const ApiError = require("../../utils/ApiError");

function getAttachmentVisibilityType(attachment) {
  if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
    throw new ApiError(500, "Attachment visibility data is inconsistent");
  }
  if (attachment.comment_id == null) return "DIRECT";
  if ([COMMENT_TYPES.PUBLIC, COMMENT_TYPES.INTERNAL].includes(attachment.comment_type)) return attachment.comment_type;
  throw new ApiError(500, "Attachment visibility data is inconsistent");
}

function isInternalAttachment(attachment) {
  return getAttachmentVisibilityType(attachment) === COMMENT_TYPES.INTERNAL;
}

function assertCanViewAttachment(ticket, attachment, currentUser) {
  const { includeInternal } = getCommentVisibilityOptions(ticket, currentUser);
  if (!attachment || String(attachment.ticket_id) !== String(ticket.id)) {
    throw new ApiError(404, "Attachment not found");
  }
  if (isInternalAttachment(attachment) && !includeInternal) throw new ApiError(404, "Attachment not found");
}

function assertKnownUser(currentUser) {
  const id = currentUser?.id;
  if (!currentUser || Array.isArray(currentUser) || !["string", "number"].includes(typeof id) ||
      (typeof id === "number" && !Number.isSafeInteger(id)) || !/^[1-9]\d*$/.test(String(id)) ||
      String(id).length > 20 || BigInt(id) > 18446744073709551615n || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) throw new ApiError(403, "You do not have permission to access this resource");
}

function assertCanUploadToCommentAttachment(ticket, comment, currentUser) {
  assertKnownUser(currentUser);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  if (!comment || comment.id == null || String(comment.ticket_id) !== String(ticket.id)) {
    throw new ApiError(404, "Comment not found");
  }
  const visibility = getAttachmentVisibilityType({ comment_id: comment.id, comment_type: comment.comment_type });
  // Authorize writes against the trusted parent comment before uploading any bytes.
  if (currentUser.role === USER_ROLES.EMPLOYEE &&
      (visibility === COMMENT_TYPES.INTERNAL ||
       String(ticket.created_by) !== String(currentUser.id))) {
    throw new ApiError(404, "Comment not found");
  }
  if (currentUser.role === USER_ROLES.TECHNICIAN &&
      (ticket.assigned_to == null || String(ticket.assigned_to) !== String(currentUser.id) ||
       (visibility === COMMENT_TYPES.INTERNAL && ticket.status === TICKET_STATUSES.OPEN))) {
    throw new ApiError(404, "Comment not found");
  }
  if (visibility === COMMENT_TYPES.INTERNAL) {
    if (ticket.status === TICKET_STATUSES.CLOSED) {
      throw new ApiError(409, "Attachments cannot be added to a closed ticket");
    }
  }
  const allowedStatuses = [TICKET_STATUSES.OPEN, TICKET_STATUSES.ASSIGNED,
    TICKET_STATUSES.IN_PROGRESS, TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.REOPENED];
  if (visibility === COMMENT_TYPES.INTERNAL) allowedStatuses.push(TICKET_STATUSES.RESOLVED);
  if (!allowedStatuses.includes(ticket.status)) {
    throw new ApiError(409, "Attachments cannot be added in the ticket's current status");
  }
}

function assertCanDeleteAttachment(ticket, attachment, currentUser) {
  assertKnownUser(currentUser);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  if (!attachment || String(attachment.ticket_id) !== String(ticket.id)) throw new ApiError(404, "Attachment not found");
  if (isInternalAttachment(attachment) && currentUser.role === USER_ROLES.EMPLOYEE) {
    throw new ApiError(404, "Attachment not found");
  }
  if (![TICKET_STATUSES.OPEN, TICKET_STATUSES.ASSIGNED, TICKET_STATUSES.IN_PROGRESS,
    TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.REOPENED].includes(ticket.status)) {
    throw new ApiError(409, "Attachments cannot be deleted in the ticket's current status");
  }
  const userId = String(currentUser.id);
  const allowed = currentUser.role === USER_ROLES.ADMIN ||
    (String(attachment.uploaded_by) === userId &&
      ((currentUser.role === USER_ROLES.EMPLOYEE && String(ticket.created_by) === userId) ||
       (currentUser.role === USER_ROLES.TECHNICIAN && ticket.assigned_to != null && String(ticket.assigned_to) === userId)));
  if (!allowed) throw new ApiError(404, "Attachment not found");

}

module.exports = { getAttachmentVisibilityType, isInternalAttachment, assertCanViewAttachment, assertCanUploadToCommentAttachment, assertCanDeleteAttachment };
