const service = require("./ticketAttachment.service");
const asyncHandler = require("../../utils/asyncHandler");

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

module.exports = { uploadTicketAttachment, uploadCommentAttachment, getTicketAttachments };
