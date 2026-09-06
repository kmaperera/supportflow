const { revokeAllUserRefreshTokens } = require("../auth/refreshToken.service");
const repository = require("./user.repository");
const { hashPassword } = require("../../utils/password");
const ApiError = require("../../utils/ApiError");
const { USER_ROLES } = require("../../constants/roles");

const PROFILE_FIELDS = ["firstName", "lastName", "email", "phone", "department", "profileImageUrl"];
const SORT_FIELDS = ["first_name", "last_name", "email", "role", "department", "created_at", "updated_at"];

function safeUser(user) {
  return {
    id: user.id, firstName: user.first_name, lastName: user.last_name,
    email: user.email, phone: user.phone, role: user.role,
    department: user.department, profileImageUrl: user.profile_image_url,
    isActive: Boolean(user.is_active), mustChangePassword: Boolean(user.must_change_password),
    lastLoginAt: user.last_login_at, createdAt: user.created_at, updatedAt: user.updated_at,
  };
}

function validateId(id) {
  const value = String(id);
  if (!/^[1-9]\d*$/.test(value) || value.length > 20 || BigInt(value) > 18446744073709551615n) {
    throw new ApiError(400, "Invalid user ID");
  }
}

async function createUser(userData) {
  const email = userData.email.trim().toLowerCase();
  if (await repository.findByEmail(email)) {
    throw new ApiError(409, "A user with this email already exists");
  }
  const passwordHash = await hashPassword(userData.password);
  let id;
  try {
    id = await repository.create({
      firstName: userData.firstName, lastName: userData.lastName, email, passwordHash,
      phone: userData.phone, role: userData.role, department: userData.department,
      profileImageUrl: userData.profileImageUrl, isActive: true, mustChangePassword: true,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new ApiError(409, "A user with this email already exists");
    throw error;
  }
  return getUserById(id);
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new ApiError(400, "Page and limit must be positive integers");
  }
  return Number(value);
}

async function getUsers(query = {}) {
  const page = positiveInteger(query.page, 1);
  const limit = Math.min(positiveInteger(query.limit, 20), 100);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new ApiError(400, "Page is too large");
  const options = { limit, offset, sortBy: query.sortBy ?? "created_at", order: query.order ?? "DESC" };
  if (!SORT_FIELDS.includes(options.sortBy) || typeof options.order !== "string" ||
      !["ASC", "DESC"].includes(options.order.toUpperCase())) {
    throw new ApiError(400, "Invalid sort options");
  }
  for (const field of ["search", "department"]) {
    if (query[field] !== undefined) {
      if (typeof query[field] !== "string") throw new ApiError(400, "Invalid filter");
      options[field] = query[field].trim();
    }
  }
  if (query.role !== undefined) {
    if (!Object.values(USER_ROLES).includes(query.role)) throw new ApiError(400, "Invalid role filter");
    options.role = query.role;
  }
  if (query.isActive !== undefined) {
    if (![true, false, "true", "false", "1", "0"].includes(query.isActive)) throw new ApiError(400, "Invalid status filter");
    options.isActive = [true, "true", "1"].includes(query.isActive);
  }
  const [users, totalRecords] = await Promise.all([repository.findAll(options), repository.countAll(options)]);
  const totalPages = Math.ceil(totalRecords / limit);
  return {
    users: users.map(safeUser),
    pagination: { currentPage: page, limit, totalRecords, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
  };
}

async function getUserById(id) {
  validateId(id);
  const user = await repository.findById(id);
  if (!user) throw new ApiError(404, "User not found");
  return safeUser(user);
}

async function updateUser(id, userData) {
  await getUserById(id);
  const keys = Object.keys(userData);
  if (!keys.length || keys.some((key) => !PROFILE_FIELDS.includes(key))) {
    throw new ApiError(400, "Only basic profile fields may be updated");
  }
  const details = { ...userData };
  if (details.email !== undefined) {
    details.email = details.email.trim().toLowerCase();
    const existing = await repository.findByEmail(details.email);
    if (existing && String(existing.id) !== String(id)) {
      throw new ApiError(409, "A user with this email already exists");
    }
  }
  try {
    await repository.updateDetails(id, details);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new ApiError(409, "A user with this email already exists");
    throw error;
  }
  return getUserById(id);
}

async function updateUserStatus(id, isActive, currentAdminId) {
  await getUserById(id);
  if (typeof isActive !== "boolean") {
    throw new ApiError(400, "isActive must be a boolean");
  }
  if (Number(id) === Number(currentAdminId) && isActive === false) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  await repository.updateStatus(id, isActive);
  if (isActive === false) {
    await revokeAllUserRefreshTokens(id);
  }
  return getUserById(id);
}

async function updateUserRole(id, role, currentAdminId) {
  const user = await getUserById(id);
  if (!Object.values(USER_ROLES).includes(role)) {
    throw new ApiError(400, "Invalid role");
  }
  if (Number(id) === Number(currentAdminId)) {
    throw new ApiError(400, "You cannot change your own role");
  }
  if (user.role === role) return user;

  await repository.updateRole(id, role);
  await revokeAllUserRefreshTokens(id);
  return getUserById(id);
}

module.exports = { createUser, getUsers, getUserById, updateUser, updateUserStatus, updateUserRole };


