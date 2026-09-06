const { body } = require("express-validator");

const changePasswordValidation = [
  body("currentPassword").isString().withMessage("Current password is required")
    .bail().notEmpty().withMessage("Current password is required"),
  body("newPassword").isString().withMessage("New password is required")
    .bail().notEmpty().withMessage("New password is required")
    .bail().isLength({ min: 8 }).withMessage("New password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("New password must contain an uppercase letter")
    .matches(/[a-z]/).withMessage("New password must contain a lowercase letter")
    .matches(/[0-9]/).withMessage("New password must contain a number"),
  body("confirmPassword").isString().withMessage("Password confirmation is required")
    .bail().notEmpty().withMessage("Password confirmation is required"),
];

module.exports = { changePasswordValidation };
