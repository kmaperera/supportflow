const asyncHandler = require('../../utils/asyncHandler');
const service = require('./passwordReset.service');
const { REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions } = require('../../utils/authCookie');

const forgotPassword = (req, res) => {
  service.requestPasswordReset(req.body.email, { ipAddress: req.ip });
  res.status(200).json({ success: true, message: service.GENERIC_MESSAGE });
};
const resetPassword = asyncHandler(async (req, res) => {
  await service.resetPassword(req.body.token, req.body.newPassword, { ipAddress: req.ip });
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions());
  res.status(200).json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
});
const adminResetPassword = asyncHandler(async (req, res) => {
  await service.sendInstructions(req.params.id, { actorUserId: req.user.id, ipAddress: req.ip }, true);
  res.status(200).json({ success: true, message: 'Password reset instructions sent.' });
});
module.exports = { forgotPassword, resetPassword, adminResetPassword };
