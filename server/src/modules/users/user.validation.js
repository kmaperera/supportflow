const { body, param } = require("express-validator");
const { USER_ROLES } = require("../../constants/roles");
const { query } = require("express-validator");

const { bodyFields, queryFields, pagination, MAX_PASSWORD_LENGTH } = require('../../middleware/inputValidation');
const { USER_SORT_FIELDS } = require('../../constants/userQuery');
const listUsersValidation = [
  queryFields(['page', 'limit', 'search', 'department', 'role', 'isActive', 'sortBy', 'order']),
  ...pagination(20),
  ...[['search', 200], ['department', 150]].map(([key, max]) => query(key).optional().isString().bail().trim().isLength({ max }).withMessage(key + ' is too long')),
  query('role').optional().isString().bail().isIn(Object.values(USER_ROLES)),
  query('isActive').optional().custom(value => ['true', 'false', '1', '0'].includes(value)).withMessage('isActive must be true, false, 1 or 0'),
  query('sortBy').optional().isString().bail().isIn(USER_SORT_FIELDS),
  query('order').optional().isString().bail().toUpperCase().isIn(['ASC', 'DESC']),
];

function profileValidation(optional) {
  const field = (name) => optional ? body(name).optional() : body(name);
  return [
    field("firstName").isString().bail().trim().isLength({ min: 1, max: 100 }).withMessage("First name must be 1 to 100 characters"),
    field("lastName").isString().bail().trim().isLength({ min: 1, max: 100 }).withMessage("Last name must be 1 to 100 characters"),
    field("email").isString().bail().trim().isLength({ max: 255 }).isEmail().withMessage("A valid email is required"),
    body("phone").optional({ values: "null" }).isString().bail().isLength({ max: 30 }),
    body("department").optional({ values: "null" }).isString().bail().isLength({ max: 150 }),
    body("profileImageUrl").optional({ values: "null" }).isString().bail().isLength({ max: 500 })
      .isURL({ protocols: ["http", "https"], require_protocol: true }),
  ];
}

const assignableTechniciansValidation = [
  query().custom((value) => {
    if (Object.keys(value).some((key) => key !== "search")) {
      throw new Error("Only search is supported");
    }
    return true;
  }),
  query("search").optional().isString().withMessage("Search must be a string")
    .bail().trim().isLength({ max: 100 }).withMessage("Search must be at most 100 characters"),
];

const createUserValidation = [
  bodyFields(['firstName', 'lastName', 'email', 'phone', 'department', 'profileImageUrl', 'password', 'role']),
  ...profileValidation(false),
  body("password").isString().bail().isLength({ min: 8, max: MAX_PASSWORD_LENGTH })
    .withMessage("Password must be 8 to 1024 characters").bail()
    .matches(/[A-Z]/).withMessage("Password must contain an uppercase letter")
    .matches(/[a-z]/).withMessage("Password must contain a lowercase letter")
    .matches(/[0-9]/).withMessage("Password must contain a number"),
  body("role").isString().bail().isIn(Object.values(USER_ROLES)).withMessage("Invalid role"),
];

const updateUserValidation = [
  body().custom((value) => {
    const allowed = ["firstName", "lastName", "email", "phone", "department", "profileImageUrl"];
    if (!value || Array.isArray(value) || typeof value !== "object" ||
        !Object.keys(value).length || Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Supply at least one basic profile field; other fields are not allowed");
    }
    return true;
  }),
  ...profileValidation(true),
];

const userIdValidation = [
  param("id").custom((value) => {
    if (!/^[1-9]\d*$/.test(value) || value.length > 20 || BigInt(value) > 18446744073709551615n) {
      throw new Error("User ID must be a positive integer");
    }
    return true;
  }),
];

const updateUserStatusValidation = [
  bodyFields(['isActive']),
  ...userIdValidation,
  body("isActive").custom((value) => typeof value === "boolean")
    .withMessage("isActive must be a boolean"),
];

const updateUserRoleValidation = [
  bodyFields(['role']),
  ...userIdValidation,
  body("role").isString().withMessage("Role is required")
    .bail().isIn(Object.values(USER_ROLES)).withMessage("Invalid role"),
];

module.exports = { listUsersValidation, assignableTechniciansValidation, createUserValidation, updateUserValidation, userIdValidation, updateUserStatusValidation, updateUserRoleValidation };


