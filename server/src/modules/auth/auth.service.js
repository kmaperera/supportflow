const tokenRepository = require("./refreshToken.repository");
const pool = require("../../config/database");
const { comparePassword, hashPassword } = require("../../utils/password");
const userRepository = require("../users/user.repository");
const ApiError = require("../../utils/ApiError");

async function login(email, password) {
  if (
    typeof email !== "string" || !email.trim() ||
    typeof password !== "string" || !password
  ) {
    throw new ApiError(400, "Email and password are required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepository.findByEmail(normalizedEmail);

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const passwordMatches = await comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Only disclose inactive status after the caller proves the password.
  if (![true, 1, "1"].includes(user.is_active)) {
    throw new ApiError(
      403,
      "Your account is inactive. Please contact an administrator."
    );
  }

  await userRepository.updateLastLogin(user.id);

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    department: user.department,
    profileImageUrl: user.profile_image_url,
    isActive: Boolean(user.is_active),
    mustChangePassword: [true, 1, "1"].includes(user.must_change_password),
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

async function changePassword(userId, currentPassword, newPassword, confirmPassword) {
  if (!userId || [currentPassword, newPassword, confirmPassword].some(
    (value) => typeof value !== "string" || !value
  )) {
    throw new ApiError(400, "User ID and all password fields are required");
  }
  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "New password and confirmation do not match");
  }

  const user = await userRepository.findById(userId);
  if (!user) throw new ApiError(401, "User account no longer exists");
  if (!(await comparePassword(currentPassword, user.password_hash))) {
    throw new ApiError(400, "Current password is incorrect");
  }
  if (await comparePassword(newPassword, user.password_hash)) {
    throw new ApiError(400, "New password must be different from the current password");
  }

  const passwordHash = await hashPassword(newPassword);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await userRepository.updatePassword(userId, passwordHash, connection);
    await tokenRepository.revokeAllForUser(userId, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { success: true };
}

module.exports = { login, changePassword };

