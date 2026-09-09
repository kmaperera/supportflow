const { body } = require("express-validator");

const createCategoryValidation = [
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some(key => !["name", "description"].includes(key))) {
      throw new Error("Only name and description may be provided");
    }
    return true;
  }),
  body("name").isString().withMessage("Name must be a string").bail()
    .trim().isLength({ min: 2, max: 100 }).withMessage("Name must be between 2 and 100 characters"),
  body("description").optional({ values: "null" })
    .isString().withMessage("Description must be a string or null").bail()
    .trim().isLength({ max: 255 }).withMessage("Description must not exceed 255 characters"),
];

module.exports = { createCategoryValidation };
