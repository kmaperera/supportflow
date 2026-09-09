const { body } = require("express-validator");

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

module.exports = { createArticleValidation };
