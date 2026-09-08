const ticketRepository = require("./ticket.repository");
const attachmentRepository = require("./ticketAttachment.repository");
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

async function uploadTicketAttachment(ticketId, file, currentUser) {
  if (!validId(ticketId)) throw new ApiError(422, "Ticket ID must be a positive integer");
  if (!currentUser || !validId(currentUser.id) ||
      typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (!Object.values(USER_ROLES).includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  validateAttachmentFile(file);

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

  const asset = await cloudinaryUpload.uploadAttachmentBuffer({
    buffer: file.buffer,
    folder: `supportflow/tickets/${ticket.ticket_number}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
  });
  let attachmentId;
  try {
    attachmentId = await attachmentRepository.createAttachment({
      ticketId, commentId: null, uploadedBy: currentUser.id,
      originalName: file.originalname, publicId: asset.publicId,
      fileUrl: asset.secureUrl, resourceType: asset.resourceType,
      mimeType: file.mimetype, fileSize: asset.bytes ?? file.size,
    });
  } catch (err) {
    try {
      await cloudinaryUpload.deleteCloudinaryAsset({
        publicId: asset.publicId, resourceType: asset.resourceType,
      });
    } catch {
      // Preserve the original database failure even if best-effort cleanup fails.
    }
    throw err;
  }

  const attachment = await attachmentRepository.findById(attachmentId);
  if (!attachment) throw new ApiError(500, "Created attachment could not be retrieved");
  return {
    id: attachment.id, ticketId: attachment.ticket_id, commentId: attachment.comment_id,
    originalName: attachment.original_name, fileUrl: attachment.file_url,
    resourceType: attachment.resource_type, mimeType: attachment.mime_type,
    fileSize: attachment.file_size, createdAt: attachment.created_at,
    uploadedBy: {
      id: attachment.uploaded_by, firstName: attachment.uploader_first_name,
      lastName: attachment.uploader_last_name, email: attachment.uploader_email,
      role: attachment.uploader_role, profileImageUrl: attachment.uploader_profile_image_url,
    },
  };
}

module.exports = { uploadTicketAttachment };
