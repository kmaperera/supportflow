const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { USER_ROLES } = require("../../constants/roles");
const { reopenTicketValidation, closeTicketValidation, resolveTicketValidation, updateTicketPriorityValidation, updateTicketStatusValidation, adminAssignTicketValidation, ticketQueueValidation, createTicketValidation, getMyTicketsValidation, ticketIdValidation, updateEmployeeTicketValidation } = require("./ticket.validation");
const { getTicketAssignmentHistory, getTicketStatusHistory, reopenTicket, closeTicket, resolveTicket, updateTicketPriority, updateTicketStatus, assignTicketByAdmin, selfAssignTicket, getTicketQueue, createTicket, getMyTickets, getTicketById, updateEmployeeTicket } = require("./ticket.controller");

const router = express.Router();
const { unassignTicketValidation } = require("./ticket.validation");
const { unassignTicketByAdmin } = require("./ticket.controller");
const { assignedTicketsValidation } = require("./ticket.validation");
const { getAssignedTicketsForTechnician } = require("./ticket.controller");
const { getAssignmentWorkflowSummary } = require("./ticket.controller");
const { createPublicCommentValidation, createInternalNoteValidation, getTicketCommentsValidation } = require("./ticketComment.validation");
const { createPublicComment, createInternalNote, getTicketComments } = require("./ticketComment.controller");
const { uploadSingleAttachment, handleMulterError } = require("../../middleware/upload");
const { validateSingleAttachment } = require("../../middleware/attachmentValidation");
const { uploadTicketAttachmentValidation, uploadCommentAttachmentValidation } = require("./ticketAttachment.validation");
const { uploadTicketAttachment, uploadCommentAttachment } = require("./ticketAttachment.controller");

router.post("/:id/attachments", authenticate, uploadSingleAttachment, handleMulterError,
  validateSingleAttachment, uploadTicketAttachmentValidation, validate, uploadTicketAttachment);
router.post("/:id/comments/:commentId/attachments", authenticate, uploadSingleAttachment, handleMulterError,
  validateSingleAttachment, uploadCommentAttachmentValidation, validate, uploadCommentAttachment);
router.get("/my", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), getMyTicketsValidation, validate, getMyTickets);
router.post("/", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), createTicketValidation, validate, createTicket);

router.get("/queue", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN), ticketQueueValidation, validate, getTicketQueue);

router.get("/assigned-to-me", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN), assignedTicketsValidation, validate, getAssignedTicketsForTechnician);

router.get("/workflow-summary", authenticate, authorizeRoles(USER_ROLES.ADMIN), getAssignmentWorkflowSummary);

router.get("/:id", authenticate, ticketIdValidation, validate, getTicketById);
router.get("/:id/comments", authenticate, getTicketCommentsValidation, validate, getTicketComments);
router.post("/:id/comments", authenticate, createPublicCommentValidation, validate, createPublicComment);
router.post("/:id/internal-notes", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN), createInternalNoteValidation, validate, createInternalNote);

router.patch("/:id", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), updateEmployeeTicketValidation, validate, updateEmployeeTicket);

router.post("/:id/self-assign", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN), ticketIdValidation, validate, selfAssignTicket);

router.patch("/:id/assign", authenticate, authorizeRoles(USER_ROLES.ADMIN), adminAssignTicketValidation, validate, assignTicketByAdmin);
router.patch("/:id/unassign", authenticate, authorizeRoles(USER_ROLES.ADMIN), unassignTicketValidation, validate, unassignTicketByAdmin);

router.patch("/:id/status", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN), updateTicketStatusValidation, validate, updateTicketStatus);

router.patch("/:id/priority", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN), updateTicketPriorityValidation, validate, updateTicketPriority);

router.patch("/:id/resolve", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN), resolveTicketValidation, validate, resolveTicket);

router.patch("/:id/close", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.ADMIN), closeTicketValidation, validate, closeTicket);

router.patch("/:id/reopen", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.ADMIN), reopenTicketValidation, validate, reopenTicket);

router.get("/:id/status-history", authenticate, ticketIdValidation, validate, getTicketStatusHistory);
router.get("/:id/assignment-history", authenticate, ticketIdValidation, validate, getTicketAssignmentHistory);

module.exports = router;






