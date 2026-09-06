const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

function getClearRefreshTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
  };
}

function getRefreshTokenCookieOptions(expiresAt) {
  return {
    ...getClearRefreshTokenCookieOptions(),
    expires: expiresAt,
  };
}

module.exports = {
  REFRESH_TOKEN_COOKIE_NAME,
  getRefreshTokenCookieOptions,
  getClearRefreshTokenCookieOptions,
};
