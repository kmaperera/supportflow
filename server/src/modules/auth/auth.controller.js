const asyncHandler = require("../../utils/asyncHandler");
const { rotateRefreshToken } = require("./refreshToken.service");
const {
  REFRESH_TOKEN_COOKIE_NAME,
  getRefreshTokenCookieOptions,
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

module.exports = { refresh };
