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

router.get("/priority-distribution", authenticate,
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getTicketPriorityDistribution);

router.get("/technician-workload", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getTechnicianWorkload);

router.get("/average-first-response-time", authenticate,
  authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN),
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getAverageFirstResponseTime);

router.get("/average-resolution-time", authenticate,
  authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN),
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getAverageResolutionTime);

router.get("/sla-compliance", authenticate,
  authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN),
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  validate, controller.getSlaComplianceMetrics);

router.get("/ticket-trend", authenticate,
  authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN),
  query().custom(value => Object.keys(value).every(key => key === "period")).withMessage("Only period is supported"),
  query("period").optional().custom(value => typeof value === "string" && ["daily", "monthly"].includes(value))
    .withMessage("Period must be daily or monthly"),
  validate, controller.getTicketTrend);

router.get("/recent-tickets", authenticate,
  authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN),
  query().custom(value => Object.keys(value).every(key => key === "limit")).withMessage("Only limit is supported"),
  query("limit").optional().custom(value => typeof value === "string" && /^(?:[1-9]|10)$/.test(value))
    .withMessage("Limit must be an integer from 1 to 10"),
  validate, controller.getRecentTickets);

router.get("/recent-activity", authenticate,
  authorizeRoles(USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN),
  query().custom(value => Object.keys(value).every(key => key === "limit")).withMessage("Only limit is supported"),
  query("limit").optional().custom(value => typeof value === "string" && /^(?:[1-9]|1[0-9]|20)$/.test(value))
    .withMessage("Limit must be an integer from 1 to 20"),
  validate, controller.getRecentTicketActivity);

module.exports = router;
