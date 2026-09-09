const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { USER_ROLES } = require("../../constants/roles");
const controller = require("./knowledgeBaseCategory.controller");
const articleController = require("./knowledgeBaseArticle.controller");
const { createArticleValidation, updateArticleValidation } = require("./knowledgeBaseArticle.validation");
const { createCategoryValidation, updateCategoryValidation, setCategoryActiveStatusValidation } = require("./knowledgeBaseCategory.validation");

const router = express.Router();

router.post("/categories", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  createCategoryValidation, validate, controller.createCategory);

router.patch("/categories/:categoryId", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  updateCategoryValidation, validate, controller.updateCategory);
router.patch("/categories/:categoryId/status", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  setCategoryActiveStatusValidation, validate, controller.setCategoryActiveStatus);

router.post("/articles", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  createArticleValidation, validate, articleController.createArticle);

router.patch("/articles/:articleId", authenticate, authorizeRoles(USER_ROLES.ADMIN),
  updateArticleValidation, validate, articleController.updateArticle);

module.exports = router;
