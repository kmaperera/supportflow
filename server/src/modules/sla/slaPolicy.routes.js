const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const { USER_ROLES } = require("../../constants/roles");
const controller = require("./slaPolicy.controller");

const router = express.Router();

router.get("/policies", authenticate, authorizeRoles(USER_ROLES.ADMIN), controller.getSlaPolicies);

module.exports = router;
