const crypto = require("node:crypto");
const { generateRefreshToken, verifyRefreshToken } = require("../../utils/jwt");
const tokenRepository = require("./refreshToken.repository");
const ApiError = require("../../utils/ApiError");

function hashRefreshToken(token) {
  if (typeof token !== "string" || !token) {
    throw new ApiError(401, "Invalid refresh token");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createRefreshToken(userId) {
  const rawToken = generateRefreshToken(userId);
  const decoded = verifyRefreshToken(rawToken);
  await tokenRepository.create({
    userId,
    tokenHash: hashRefreshToken(rawToken),
    expiresAt: new Date(decoded.exp * 1000),
  });
  return rawToken;
}

async function validateStoredRefreshToken(rawToken) {
  const decoded = verifyRefreshToken(rawToken);
  const tokenRecord = await tokenRepository.findActiveByHash(hashRefreshToken(rawToken));
  if (!tokenRecord || String(tokenRecord.user_id) !== decoded.sub) {
    throw new ApiError(401, "Invalid refresh token");
  }
  return { tokenRecord, decoded };
}

async function revokeRefreshToken(rawToken) {
  const record = await tokenRepository.findActiveByHash(hashRefreshToken(rawToken));
  if (!record) return false;
  return (await tokenRepository.revokeById(record.id)) > 0;
}

async function revokeAllUserRefreshTokens(userId) {
  return tokenRepository.revokeAllForUser(userId);
}

module.exports = {
  hashRefreshToken, createRefreshToken, validateStoredRefreshToken,
  revokeRefreshToken, revokeAllUserRefreshTokens,
};
