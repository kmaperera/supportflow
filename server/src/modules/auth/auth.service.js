const bcrypt = require("bcryptjs");
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

  if (!user.is_active) {
    throw new ApiError(
      403,
      "Your account is inactive. Please contact an administrator."
    );
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid email or password");
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
    mustChangePassword: Boolean(user.must_change_password),
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

module.exports = { login };
