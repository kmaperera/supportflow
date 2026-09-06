const { body, param } = require("express-validator");
const { USER_ROLES } = require("../../constants/roles");

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

const createUserValidation = [
  ...profileValidation(false),
  body("password").isString().bail().isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Password must contain an uppercase letter")
    .matches(/[a-z]/).withMessage("Password must contain a lowercase letter")
    .matches(/[0-9]/).withMessage("Password must contain a number"),
  body("role").isIn(Object.values(USER_ROLES)).withMessage("Invalid role"),
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

module.exports = { createUserValidation, updateUserValidation, userIdValidation };
