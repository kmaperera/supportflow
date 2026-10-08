const ticketRepository = require("./ticket.repository");
const attachmentRepository = require("./ticketAttachment.repository");
const ticketCommentRepository = require("./ticketComment.repository");
const { getCommentVisibilityOptions } = require("./ticketCommentAccess.service");
const attachmentAccess = require("./ticketAttachmentAccess.service");
const cloudinaryUpload = require("../../services/cloudinaryUpload.service");
const { validateAttachmentFile } = require("../../middleware/attachmentValidation");
const { USER_ROLES } = require("../../constants/roles");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");
const ApiError = require("../../utils/ApiError");

function validId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
}

async function authorizeTicketAttachmentUpload(ticketId, currentUser) {
  if (!validId(ticketId)) throw new ApiError(422, "Ticket ID must be a positive integer");
  if (!currentUser || !validId(currentUser.id) ||
      typeof currentUser.role !== "string" || !currentUser.role) {
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
    (currentUser.role === USER_ROLES.TECHNICIAN &&
      ticket.assigned_to != null && String(ticket.assigned_to) === userId);
  if (!allowed) throw new ApiError(404, "Ticket not found");
  if (![TICKET_STATUSES.OPEN, TICKET_STATUSES.ASSIGNED, TICKET_STATUSES.IN_PROGRESS,
    TICKET_STATUSES.WAITING_FOR_USER, TICKET_STATUSES.REOPENED].includes(ticket.status)) {
    throw new ApiError(409, "Attachments cannot be added in the ticket's current status");
  }

  return ticket;
}

async function uploadTicketAttachment(ticketId, file, currentUser) {
  await authorizeTicketAttachmentUpload(ticketId, currentUser);
  validateAttachmentFile(file);
  return persistAttachment(ticketId, null, file, currentUser);
}

async function authorizeCommentAttachmentUpload(ticketId, commentId, currentUser) {
  if (!validId(ticketId)) throw new ApiError(422, "Ticket ID must be a positive integer");
  if (!validId(commentId)) throw new ApiError(422, "Comment ID must be a positive integer");
  if (!currentUser || typeof currentUser !== "object" || Array.isArray(currentUser) ||
      !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }

  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const comment = await ticketCommentRepository.findById(commentId);
  attachmentAccess.assertCanUploadToCommentAttachment(ticket, comment, currentUser);
  return ticket;
}

async function uploadCommentAttachment(ticketId, commentId, file, currentUser) {
  await authorizeCommentAttachmentUpload(ticketId, commentId, currentUser);
  validateAttachmentFile(file);
  return persistAttachment(ticketId, commentId, file, currentUser);
}

async function persistAttachment(ticketId, commentId, file, currentUser) {
  const asset = await cloudinaryUpload.uploadAttachmentBuffer({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
  });
  let attachmentId;
  try {
    attachmentId = await attachmentRepository.createAttachment({
      ticketId, commentId, uploadedBy: currentUser.id,
      originalName: file.originalname, publicId: asset.publicId,
      fileUrl: asset.secureUrl, resourceType: asset.resourceType, deliveryType: asset.deliveryType,
      mimeType: file.mimetype, fileSize: asset.bytes ?? file.size,
    });
  } catch (err) {
    try {
      const cleanup = await cloudinaryUpload.deleteCloudinaryAsset({
        publicId: asset.publicId, resourceType: asset.resourceType, deliveryType: asset.deliveryType ?? "upload",
      });
      if (!["ok", "not found"].includes(cleanup?.result)) throw new Error("Cleanup incomplete");
    } catch {
      // Preserve the DB error while making compensation failure observable.
      console.error("Cloudinary attachment rollback cleanup failed");
    }
    throw err;
  }

  const attachment = await attachmentRepository.findById(attachmentId);
  if (!attachment) throw new ApiError(500, "Created attachment could not be retrieved");
  return mapAttachment(attachment);
}

async function getTicketAttachments(ticketId, currentUser) {
  if (!validId(ticketId)) throw new ApiError(422, "Ticket ID must be a positive integer");
  if (!currentUser || typeof currentUser !== "object" || Array.isArray(currentUser) ||
      !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const { includeInternal } = getCommentVisibilityOptions(ticket, currentUser);
  const rows = await attachmentRepository.findByTicketId(ticketId, { includeInternal });
  return rows.filter((row) => {
    const internal = attachmentAccess.isInternalAttachment(row);
    if (internal && !includeInternal) return false;
    attachmentAccess.assertCanViewAttachment(ticket, row, currentUser);
    return true;
  }).map(mapAttachment);
}

async function getAttachmentForDownload(ticketId, attachmentId, currentUser) {
  if (!validId(ticketId)) throw new ApiError(422, "Ticket ID must be a positive integer");
  if (!validId(attachmentId)) throw new ApiError(422, "Attachment ID must be a positive integer");
  if (!currentUser || typeof currentUser !== "object" || Array.isArray(currentUser) ||
      !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const attachment = await attachmentRepository.findById(attachmentId);
  if (!attachment || String(attachment.ticket_id) !== String(ticket.id)) {
    throw new ApiError(404, "Attachment not found");
  }
  attachmentAccess.assertCanViewAttachment(ticket, attachment, currentUser);
  return {
    originalName: attachment.original_name, mimeType: attachment.mime_type,
    fileSize: attachment.file_size, fileUrl: attachment.file_url,
    publicId: attachment.public_id, resourceType: attachment.resource_type, deliveryType: attachment.delivery_type ?? "upload",
  };
}

async function deleteTicketAttachment(ticketId, attachmentId, currentUser) {
  if (!validId(ticketId)) throw new ApiError(422, "Ticket ID must be a positive integer");
  if (!validId(attachmentId)) throw new ApiError(422, "Attachment ID must be a positive integer");
  if (!currentUser || typeof currentUser !== "object" || Array.isArray(currentUser) ||
      !validId(currentUser.id) || typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const attachment = await attachmentRepository.findById(attachmentId);
  if (!attachment || String(attachment.ticket_id) !== String(ticket.id)) {
    throw new ApiError(404, "Attachment not found");
  }
  attachmentAccess.assertCanDeleteAttachment(ticket, attachment, currentUser);

  const result = await cloudinaryUpload.deleteCloudinaryAsset({
    publicId: attachment.public_id, resourceType: attachment.resource_type, deliveryType: attachment.delivery_type ?? "upload",
  });
  // An already-absent asset is safe to remove from MySQL, including on a retry.
  if (!["ok", "not found"].includes(result?.result)) {
    console.error("Cloudinary attachment deletion incomplete");
    throw new ApiError(502, "Attachment asset deletion failed");
  }
  const affectedRows = await attachmentRepository.deleteById(attachmentId);
  if (affectedRows !== 1) throw new ApiError(500, "Attachment database deletion failed");
  return attachmentId;
}

function mapAttachment(attachment) {
  return {
    id: attachment.id, ticketId: attachment.ticket_id, commentId: attachment.comment_id,
    originalName: attachment.original_name,
    downloadPath: `/api/v1/tickets/${attachment.ticket_id}/attachments/${attachment.id}/download`,
    mimeType: attachment.mime_type,
    fileSize: attachment.file_size, createdAt: attachment.created_at,
    uploadedBy: {
      id: attachment.uploader_id ?? attachment.uploaded_by, firstName: attachment.uploader_first_name,
      lastName: attachment.uploader_last_name, email: attachment.uploader_email,
      role: attachment.uploader_role, profileImageUrl: attachment.uploader_profile_image_url,
    },
  };
}

module.exports = { authorizeTicketAttachmentUpload, authorizeCommentAttachmentUpload, uploadTicketAttachment, uploadCommentAttachment, getTicketAttachments, getAttachmentForDownload, deleteTicketAttachment };
