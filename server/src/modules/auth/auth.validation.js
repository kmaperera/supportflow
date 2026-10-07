const { body } = require("express-validator");

const { bodyFields, queryFields, emptyBody, MAX_PASSWORD_LENGTH } = require('../../middleware/inputValidation');
const changePasswordValidation = [
  bodyFields(['currentPassword', 'newPassword', 'confirmPassword']),
  ...['currentPassword', 'newPassword', 'confirmPassword'].map(key => body(key).isString().bail().isLength({ max: MAX_PASSWORD_LENGTH }).withMessage(key + ' must not exceed 1024 characters')),
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

const loginValidation = [
  bodyFields(['email', 'password']),
  body("email").isString().withMessage("Email is required")
    .bail().trim().notEmpty().withMessage("Email is required")
    .bail().isLength({ max: 255 }).withMessage('Email must not exceed 255 characters').bail().isEmail().withMessage("A valid email is required"),
  body("password").isString().withMessage("Password is required")
    .bail().isLength({ min: 1, max: MAX_PASSWORD_LENGTH }).withMessage("Password must be 1 to 1024 characters"),
];

const cookieActionValidation = [emptyBody(), queryFields([])];
module.exports = { changePasswordValidation, loginValidation, cookieActionValidation };

