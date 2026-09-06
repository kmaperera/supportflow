const { JsonWebTokenError, TokenExpiredError } = require("jsonwebtoken");
const { verifyAccessToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const userRepository = require("../modules/users/user.repository");

const authenticate = asyncHandler(async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (authorization === undefined) {
    throw new ApiError(401, "Authentication required");
  }

  const match = typeof authorization === "string"
    ? /^Bearer ([^\s]+)$/.exec(authorization)
    : null;
  if (!match) {
    throw new ApiError(401, "Invalid authorization header");
  }

  let decoded;
  try {
    decoded = verifyAccessToken(match[1]);
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new ApiError(401, "Access token expired");
    }
    if (error instanceof JsonWebTokenError) {
      throw new ApiError(401, "Invalid access token");
    }
    throw error;
  }

  const userId = decoded.sub;
  // Preserve BIGINT precision by passing the validated decimal string to MySQL.
  if (typeof userId !== "string" || !/^[1-9]\d*$/.test(userId) ||
      userId.length > 20 || BigInt(userId) > 18446744073709551615n) {
    throw new ApiError(401, "Invalid access token");
  }

  const user = await userRepository.findById(userId);
  if (!user) {
    throw new ApiError(401, "User account no longer exists");
  }
  if (!user.is_active) {
    throw new ApiError(403, "Your account is inactive. Please contact an administrator.");
  }

  req.user = {
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
  };
  next();
});

module.exports = authenticate;
