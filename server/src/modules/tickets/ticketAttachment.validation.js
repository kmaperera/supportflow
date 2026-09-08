const { ticketIdValidation } = require("./ticket.validation");

const uploadTicketAttachmentValidation = [...ticketIdValidation];

module.exports = { uploadTicketAttachmentValidation };
