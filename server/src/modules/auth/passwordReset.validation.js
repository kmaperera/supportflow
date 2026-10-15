const { body } = require('express-validator');
const { bodyFields, queryFields, emptyBody, MAX_PASSWORD_LENGTH } = require('../../middleware/inputValidation');
const { newPasswordValidation } = require('./auth.validation');

const forgotPasswordValidation = [bodyFields(['email']), queryFields([]),
  body('email').isString().bail().trim().isLength({ min: 1, max: 255 }).bail().isEmail().withMessage('Enter a valid email address')];
// Same policy as change-password: 8..1024 characters, upper/lower/digit.
const resetPasswordValidation = [bodyFields(['token', 'newPassword', 'confirmPassword']), queryFields([]),
  body('token').isString().bail().notEmpty().isLength({ max: 256 }).withMessage('Password reset link is invalid or expired'),
  newPasswordValidation(),
  body('newPassword').isString().bail().isLength({ max: MAX_PASSWORD_LENGTH }).withMessage('New password must not exceed 1024 characters'),
  body('confirmPassword').isString().bail().isLength({ min: 1, max: MAX_PASSWORD_LENGTH }).withMessage('Password confirmation is required and must not exceed 1024 characters')
    .custom((value, { req }) => value === req.body.newPassword).withMessage('Passwords do not match')];
const adminResetValidation = [emptyBody(), queryFields([])];
module.exports = { forgotPasswordValidation, resetPasswordValidation, adminResetValidation };
