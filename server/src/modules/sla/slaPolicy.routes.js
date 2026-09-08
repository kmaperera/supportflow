const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const { USER_ROLES } = require("../../constants/roles");
const controller = require("./slaPolicy.controller");
const validate = require("../../middleware/validate");
const { updateSlaPolicyValidation } = require("./slaPolicy.validation");

const router = express.Router();

router.get("/policies", authenticate, authorizeRoles(USER_ROLES.ADMIN), controller.getSlaPolicies);
router.patch("/policies/:policyId", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  updateSlaPolicyValidation, validate, controller.updateSlaPolicy);

module.exports = router;
