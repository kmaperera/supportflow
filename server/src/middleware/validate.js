const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array().map((error) => ({
      field: error.path || error.type,
      message: error.msg,
    }));
    return next(new ApiError(422, "Validation failed", errors));
  }
  next();
}

module.exports = validate;
