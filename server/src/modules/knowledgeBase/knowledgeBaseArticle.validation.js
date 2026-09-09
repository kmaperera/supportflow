const { body, param } = require("express-validator");

const createArticleValidation = [
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some(key => !["categoryId", "title", "content"].includes(key))) {
      throw new Error("Only categoryId, title and content may be provided");
    }
    return true;
  }),
  body("categoryId").custom(value => Number.isSafeInteger(value) && value > 0)
    .withMessage("Category ID must be a positive integer"),
  body("title").isString().withMessage("Title must be a string").bail().trim()
    .isLength({ min: 3, max: 200 }).withMessage("Title must be between 3 and 200 characters"),
  body("content").isString().withMessage("Content must be a string").bail().trim()
    .notEmpty().withMessage("Content must not be empty"),
];

const updateArticleValidation = [
  param("articleId").custom(value => {
    if (!/^[1-9]\d*$/.test(value) || value.length > 20 || BigInt(value) > 18446744073709551615n) {
      throw new Error("Article ID must be a positive integer");
    }
    return true;
  }),
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length ||
        Object.keys(value).some(key => !["categoryId", "title", "content"].includes(key))) {
      throw new Error("Provide at least one of categoryId, title or content only");
    }
    return true;
  }),
  body("categoryId").optional().custom(value => Number.isSafeInteger(value) && value > 0)
    .withMessage("Category ID must be a positive integer"),
  body("title").optional().isString().withMessage("Title must be a string").bail().trim()
    .isLength({ min: 3, max: 200 }).withMessage("Title must be between 3 and 200 characters"),
  body("content").optional().isString().withMessage("Content must be a string").bail().trim()
    .notEmpty().withMessage("Content must not be empty"),
];

module.exports = { createArticleValidation, updateArticleValidation };
