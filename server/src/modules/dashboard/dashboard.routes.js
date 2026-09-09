const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const { USER_ROLES } = require("../../constants/roles");
const controller = require("./dashboard.controller");
const { query } = require("express-validator");
const validate = require("../../middleware/validate");

const router = express.Router();
router.get("/employee/summary", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), controller.getEmployeeSummary);
router.get("/technician/summary", authenticate, authorizeRoles(USER_ROLES.TECHNICIAN), controller.getTechnicianSummary);

router.get("/admin/summary", authenticate, authorizeRoles(USER_ROLES.ADMIN), controller.getAdminSummary);

router.get("/ticket-summary", authenticate,
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getTicketSummaryCards);

router.get("/status-distribution", authenticate,
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getTicketStatusDistribution);

router.get("/category-distribution", authenticate,
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getTicketCategoryDistribution);

module.exports = router;
