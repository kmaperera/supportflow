const { body, param } = require("express-validator");

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

const categoryIdValidation = () => param("categoryId").custom(value => {
  if (!/^[1-9]\d*$/.test(value) || value.length > 20 || BigInt(value) > 18446744073709551615n) {
    throw new Error("Category ID must be a positive integer");
  }
  return true;
});

const updateCategoryValidation = [
  categoryIdValidation(),
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length ||
        Object.keys(value).some(key => !["name", "description"].includes(key))) {
      throw new Error("Provide at least one of name or description only");
    }
    return true;
  }),
  body("name").optional().isString().withMessage("Name must be a string").bail()
    .trim().isLength({ min: 2, max: 100 }).withMessage("Name must be between 2 and 100 characters"),
  body("description").optional({ values: "null" }).isString()
    .withMessage("Description must be a string or null").bail()
    .trim().isLength({ max: 255 }).withMessage("Description must not exceed 255 characters"),
];

const setCategoryActiveStatusValidation = [
  categoryIdValidation(),
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some(key => key !== "isActive")) {
      throw new Error("Only isActive may be provided");
    }
    return true;
  }),
  body("isActive").custom(value => typeof value === "boolean").withMessage("isActive must be a boolean"),
];

module.exports = { createCategoryValidation, updateCategoryValidation, setCategoryActiveStatusValidation };
