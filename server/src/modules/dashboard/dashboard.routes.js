const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const { USER_ROLES } = require("../../constants/roles");
const controller = require("./dashboard.controller");

const router = express.Router();
router.get("/employee/summary", authenticate, authorizeRoles(USER_ROLES.EMPLOYEE), controller.getEmployeeSummary);

module.exports = router;
