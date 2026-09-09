const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { USER_ROLES } = require("../../constants/roles");
const controller = require("./knowledgeBaseCategory.controller");
const { createCategoryValidation } = require("./knowledgeBaseCategory.validation");

const router = express.Router();

router.post("/categories", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  createCategoryValidation, validate, controller.createCategory);

module.exports = router;
