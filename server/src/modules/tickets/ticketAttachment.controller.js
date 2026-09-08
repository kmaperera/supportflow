const service = require("./ticketAttachment.service");
const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const { MAX_ATTACHMENT_SIZE } = require("../../constants/attachmentTypes");

const uploadTicketAttachment = asyncHandler(async (req, res) => {
  const attachment = await service.uploadTicketAttachment(req.params.id, req.file, req.user);
  res.status(201).json({
    success: true,
    message: "Attachment uploaded successfully",
    data: { attachment },
  });
});

const uploadCommentAttachment = asyncHandler(async (req, res) => {
  const attachment = await service.uploadCommentAttachment(
    req.params.id, req.params.commentId, req.file, req.user
  );
  res.status(201).json({
    success: true,
    message: "Comment attachment uploaded successfully",
    data: { attachment },
  });
});

const getTicketAttachments = asyncHandler(async (req, res) => {
  const attachments = await service.getTicketAttachments(req.params.id, req.user);
  res.status(200).json({
    success: true,
    message: "Ticket attachments retrieved successfully",
    data: { attachments },
  });
});

const downloadTicketAttachment = asyncHandler(async (req, res) => {
  const attachment = await service.getAttachmentForDownload(req.params.id, req.params.attachmentId, req.user);
  let buffer;
  try {
    const response = await fetch(attachment.fileUrl, {
      signal: AbortSignal.timeout(30000), redirect: "error",
    });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_ATTACHMENT_SIZE) {
      await response.body?.cancel();
      throw new Error("Invalid upstream response");
    }
    buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_ATTACHMENT_SIZE) throw new Error("Invalid upstream size");
  } catch {
    throw new ApiError(502, "Attachment download failed");
  }
  const filename = (attachment.originalName || "attachment")
    .replace(/[^\x20-\x7E]|["\\/;]/g, "_").slice(0, 255).trim() || "attachment";
  res.set({
    "Content-Type": attachment.mimeType,
    "Content-Length": String(buffer.length),
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  });
  res.status(200).send(buffer);
});

const deleteTicketAttachment = asyncHandler(async (req, res) => {
  await service.deleteTicketAttachment(req.params.id, req.params.attachmentId, req.user);
  res.status(200).json({ success: true, message: "Attachment deleted successfully", data: null });
});

module.exports = { uploadTicketAttachment, uploadCommentAttachment, getTicketAttachments, downloadTicketAttachment, deleteTicketAttachment };
