const morgan = require("morgan");

const requestLogger =
  process.env.NODE_ENV === "test"
    ? (req, res, next) => next()
    : morgan(process.env.NODE_ENV === "development" ? "dev" : "combined");

module.exports = requestLogger;
