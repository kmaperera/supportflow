const { body } = require("express-validator");
const { ticketIdValidation } = require("./ticket.validation");

const createPublicCommentValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => key !== "content")) {
      throw new Error("Only content is allowed");
    }
    return true;
  }),
  body("content").isString().withMessage("Content is required and must be a string")
    .bail().trim().isLength({ min: 1, max: 5000 }).withMessage("Content must be 1 to 5000 characters"),
];

module.exports = { createPublicCommentValidation };
