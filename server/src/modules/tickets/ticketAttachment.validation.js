const { ticketIdValidation } = require("./ticket.validation");
const { param, query } = require("express-validator");

const { emptyBody, queryFields } = require('../../middleware/inputValidation');
const uploadTicketAttachmentValidation = [...ticketIdValidation, emptyBody(), queryFields([])];

const uploadCommentAttachmentValidation = [
  emptyBody(), queryFields([]),
  ...ticketIdValidation,
  param("commentId").custom((value) => {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || value.length > 20) return false;
    return BigInt(value) <= 18446744073709551615n;
  }).withMessage("Comment ID must be a positive integer"),
];

const getTicketAttachmentsValidation = [
  ...ticketIdValidation,
  query().custom((value) => {
    if (Object.keys(value).length) throw new Error("Query parameters are not supported");
    return true;
  }),
];

const downloadTicketAttachmentValidation = [
  ...getTicketAttachmentsValidation,
  param("attachmentId").custom((value) => {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || value.length > 20) return false;
    return BigInt(value) <= 18446744073709551615n;
  }).withMessage("Attachment ID must be a positive integer"),
];

const deleteTicketAttachmentValidation = [...downloadTicketAttachmentValidation];

module.exports = { uploadTicketAttachmentValidation, uploadCommentAttachmentValidation, getTicketAttachmentsValidation, downloadTicketAttachmentValidation, deleteTicketAttachmentValidation };
