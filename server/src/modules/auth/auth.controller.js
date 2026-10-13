const { generateAccessToken, verifyRefreshToken } = require("../../utils/jwt");
const authService = require("./auth.service");
const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const audit = require('../audit/audit.service');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require('../../constants/audit');
const {
  rotateRefreshToken, revokeRefreshSession, createRefreshToken,
  validateStoredRefreshToken, revokeAllUserRefreshTokens,
} = require("./refreshToken.service");
const {
  REFRESH_TOKEN_COOKIE_NAME,
  getRefreshTokenCookieOptions,
  getClearRefreshTokenCookieOptions,
} = require("../../utils/authCookie");

const refresh = asyncHandler(async (req, res) => {
  const result = await rotateRefreshToken(req.cookies?.[REFRESH_TOKEN_COOKIE_NAME], { ipAddress: req.ip });
  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    result.refreshToken,
    getRefreshTokenCookieOptions(result.refreshTokenExpiresAt)
  );
  return res.status(200).json({
    success: true,
    message: "Session refreshed successfully",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const logout = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
  let session;
  if (rawToken) {
    session = await revokeRefreshSession(rawToken);
  }

  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions());
  if (session) await audit.log({ actorUserId: session.userId, action: AUDIT_ACTIONS.LOGOUT,
    entityType: AUDIT_ENTITY_TYPES.AUTH, entityId: session.userId, ipAddress: req.ip });
  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

const logoutAll = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
  if (!rawToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  const { decoded } = await validateStoredRefreshToken(rawToken);
  const revokedSessionCount = await revokeAllUserRefreshTokens(decoded.sub);

  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions());
  await audit.log({ actorUserId: decoded.sub, action: AUDIT_ACTIONS.LOGOUT_ALL,
    entityType: AUDIT_ENTITY_TYPES.AUTH, entityId: decoded.sub, ipAddress: req.ip,
    metadata: { revokedSessionCount } });
  return res.status(200).json({
    success: true,
    message: "Logged out from all sessions successfully",
  });
});

const getCurrentUser = (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Current user retrieved successfully",
    data: { user: req.user },
  });
};

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const result = await authService.changePassword(req.user.id, currentPassword, newPassword, confirmPassword);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions());
  await audit.log({ actorUserId: req.user.id, action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.USER, entityId: req.user.id, ipAddress: req.ip,
    metadata: { sessionsRevoked: result.sessionsRevoked, forcedChange: result.forcedChange } });
  return res.status(200).json({
    success: true,
    message: "Password changed successfully. Please log in again.",
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.login(email, password, { ipAddress: req.ip });
  const accessToken = generateAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);
  const decoded = verifyRefreshToken(refreshToken);

  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    refreshToken,
    getRefreshTokenCookieOptions(new Date(decoded.exp * 1000))
  );
  await audit.log({ actorUserId: user.id, action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: AUDIT_ENTITY_TYPES.AUTH, entityId: user.id, ipAddress: req.ip });
  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: { accessToken, user },
  });
});

module.exports = { refresh, logout, logoutAll, getCurrentUser, changePassword, login };





