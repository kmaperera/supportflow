const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { USER_ROLES } = require("../../constants/roles");
const { createTicketValidation, getMyTicketsValidation } = require("./ticket.validation");
const { createTicket, getMyTickets } = require("./ticket.controller");

const router = express.Router();
router.get("/my", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), getMyTicketsValidation, validate, getMyTickets);
router.post("/", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), createTicketValidation, validate, createTicket);

module.exports = router;

