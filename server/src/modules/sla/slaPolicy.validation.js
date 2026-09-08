const { body, param } = require("express-validator");

const updateSlaPolicyValidation = [
  param("policyId").custom((value) => {
    if (!/^[1-9]\d*$/.test(value) || value.length > 20 || BigInt(value) > 18446744073709551615n) {
      throw new Error("Policy ID must be a positive integer");
    }
    return true;
  }),
  body().custom((value) => {
    const allowed = ["responseTimeMinutes", "resolutionTimeMinutes"];
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Only responseTimeMinutes and resolutionTimeMinutes may be updated");
    }
    return true;
  }),
  ...["responseTimeMinutes", "resolutionTimeMinutes"].map((field) =>
    body(field).custom((value) => Number.isInteger(value) && value > 0 && value <= 4294967295)
      .withMessage(`${field} must be a positive integer within the unsigned INT range`)
  ),
  body("resolutionTimeMinutes").custom((value, { req }) => {
    if (Number.isInteger(value) && Number.isInteger(req.body.responseTimeMinutes) &&
        value < req.body.responseTimeMinutes) {
      throw new Error("Resolution time must be greater than or equal to response time");
    }
    return true;
  }),
];

module.exports = { updateSlaPolicyValidation };
