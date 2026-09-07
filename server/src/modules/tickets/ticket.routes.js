const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { USER_ROLES } = require("../../constants/roles");
const { ticketQueueValidation, createTicketValidation, getMyTicketsValidation, ticketIdValidation, updateEmployeeTicketValidation } = require("./ticket.validation");
const { selfAssignTicket, getTicketQueue, createTicket, getMyTickets, getTicketById, updateEmployeeTicket } = require("./ticket.controller");

const router = express.Router();
router.get("/my", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), getMyTicketsValidation, validate, getMyTickets);
router.post("/", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), createTicketValidation, validate, createTicket);

router.get("/queue", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN), ticketQueueValidation, validate, getTicketQueue);

router.get("/:id", authenticate, ticketIdValidation, validate, getTicketById);

router.patch("/:id", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), updateEmployeeTicketValidation, validate, updateEmployeeTicket);

router.post("/:id/self-assign", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN), ticketIdValidation, validate, selfAssignTicket);

module.exports = router;





