const { body } = require("express-validator");

const positiveId = (value) => {
  if (!(["string", "number"].includes(typeof value)) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
};

const createTicketValidation = [
  body().custom((value) => {
    const allowed = ["categoryId", "priorityId", "title", "description"];
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Only categoryId, priorityId, title, and description are allowed");
    }
    return true;
  }),
  body("categoryId").custom(positiveId).withMessage("Category ID must be a positive integer"),
  body("priorityId").custom(positiveId).withMessage("Priority ID must be a positive integer"),
  body("title").isString().withMessage("Title is required").bail()
    .trim().isLength({ min: 5, max: 200 }).withMessage("Title must be 5 to 200 characters"),
  body("description").isString().withMessage("Description is required").bail()
    .trim().isLength({ min: 10, max: 5000 }).withMessage("Description must be 10 to 5000 characters"),
];

module.exports = { createTicketValidation };
