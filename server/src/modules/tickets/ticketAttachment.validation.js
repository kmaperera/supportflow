const { ticketIdValidation } = require("./ticket.validation");
const { param } = require("express-validator");

const uploadTicketAttachmentValidation = [...ticketIdValidation];

const uploadCommentAttachmentValidation = [
  ...ticketIdValidation,
  param("commentId").custom((value) => {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || value.length > 20) return false;
    return BigInt(value) <= 18446744073709551615n;
  }).withMessage("Comment ID must be a positive integer"),
];

module.exports = { uploadTicketAttachmentValidation, uploadCommentAttachmentValidation };
