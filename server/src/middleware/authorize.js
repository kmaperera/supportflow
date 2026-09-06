const ApiError = require("../utils/ApiError");
const { USER_ROLES } = require("../constants/roles");

function authorizeRoles(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new TypeError("authorizeRoles requires at least one role");
  }

  const validRoles = Object.values(USER_ROLES);
  if (allowedRoles.some((role) => !validRoles.includes(role))) {
    throw new TypeError("authorizeRoles accepts only EMPLOYEE, TECHNICIAN, or ADMIN");
  }

  return (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, "You do not have permission to access this resource");
    }
    next();
  };
}

module.exports = authorizeRoles;
