const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { USER_ROLES } = require("../../constants/roles");
const { createTicketValidation, getMyTicketsValidation, ticketIdValidation, updateEmployeeTicketValidation } = require("./ticket.validation");
const { createTicket, getMyTickets, getTicketById, updateEmployeeTicket } = require("./ticket.controller");

const router = express.Router();
router.get("/my", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), getMyTicketsValidation, validate, getMyTickets);
router.post("/", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), createTicketValidation, validate, createTicket);

router.get("/:id", authenticate, ticketIdValidation, validate, getTicketById);

router.patch("/:id", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), updateEmployeeTicketValidation, validate, updateEmployeeTicket);

module.exports = router;



