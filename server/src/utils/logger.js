const morgan = require("morgan");

// Exclude query strings, bodies and credential-bearing headers.
morgan.token("safe-path", req => req.path);

const requestLogger =
  process.env.NODE_ENV === "test"
    ? (req, res, next) => next()
    : morgan(":method :safe-path :status :response-time ms");

module.exports = requestLogger;
