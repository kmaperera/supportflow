const { JsonWebTokenError } = require("jsonwebtoken");
const userRepository = require("../users/user.repository");
const crypto = require("node:crypto");
const { generateRefreshToken, verifyRefreshToken, generateAccessToken } = require("../../utils/jwt");
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
  let decoded;
  try {
    decoded = verifyRefreshToken(rawToken);
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      throw new ApiError(401, "Invalid refresh token");
    }
    throw error;
  }
  await tokenRepository.create({
    userId,
    tokenHash: hashRefreshToken(rawToken),
    expiresAt: new Date(decoded.exp * 1000),
  });
  return rawToken;
}

async function validateStoredRefreshToken(rawToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(rawToken);
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      throw new ApiError(401, "Invalid refresh token");
    }
    throw error;
  }
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

async function rotateRefreshToken(rawToken) {
  if (!rawToken) throw new ApiError(401, "Refresh token is required");

  const { tokenRecord, decoded } = await validateStoredRefreshToken(rawToken);
  const user = await userRepository.findById(decoded.sub);
  if (!user) throw new ApiError(401, "Invalid refresh token");
  if (!user.is_active) {
    throw new ApiError(403, "Your account is inactive. Please contact an administrator.");
  }

  // Only the request that revokes the active record may issue a replacement.
  if ((await tokenRepository.revokeById(tokenRecord.id)) !== 1) {
    throw new ApiError(401, "Invalid refresh token");
  }

  const refreshToken = await createRefreshToken(user.id);
  const accessToken = generateAccessToken(user);
  const replacement = verifyRefreshToken(refreshToken);

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: new Date(replacement.exp * 1000),
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      department: user.department,
      profileImageUrl: user.profile_image_url,
      isActive: Boolean(user.is_active),
      mustChangePassword: Boolean(user.must_change_password),
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  };
}

module.exports = {
  hashRefreshToken, createRefreshToken, validateStoredRefreshToken,
  revokeRefreshToken, revokeAllUserRefreshTokens, rotateRefreshToken,
};

