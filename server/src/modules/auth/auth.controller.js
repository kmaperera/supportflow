const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const {
  rotateRefreshToken, revokeRefreshToken,
  validateStoredRefreshToken, revokeAllUserRefreshTokens,
} = require("./refreshToken.service");
const {
  REFRESH_TOKEN_COOKIE_NAME,
  getRefreshTokenCookieOptions,
  getClearRefreshTokenCookieOptions,
} = require("../../utils/authCookie");

const refresh = asyncHandler(async (req, res) => {
  const result = await rotateRefreshToken(req.cookies?.[REFRESH_TOKEN_COOKIE_NAME]);
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
  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }

  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions());
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
  await revokeAllUserRefreshTokens(decoded.sub);

  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions());
  return res.status(200).json({
    success: true,
    message: "Logged out from all sessions successfully",
  });
});

module.exports = { refresh, logout, logoutAll };


