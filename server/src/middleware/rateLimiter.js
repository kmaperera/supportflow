const { rateLimit } = require("express-rate-limit");

function positiveInteger(value, fallback, maximum) {
  if (!/^[1-9]\d*$/.test(String(value ?? ""))) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= maximum ? number : fallback;
}

function rateLimitSettings(env = process.env) {
  return {
    windowMs: positiveInteger(env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 24 * 60 * 60 * 1000),
    limit: positiveInteger(env.API_RATE_LIMIT_MAX, env.NODE_ENV === "development" ? 5000 : 1000, 1000000),
  };
}

function createApiRateLimiter(env = process.env) {
  return rateLimit({
    ...rateLimitSettings(env),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    identifier: "api",
    // Use the library's IP key and IPv6 subnet handling; trust proxy stays false.
    skip: req => req.method === "OPTIONS",
    handler: (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
        errors: [],
      });
    },
  });
}

function loginRateLimitSettings(env = process.env) {
  return {
    windowMs: positiveInteger(env.LOGIN_RATE_LIMIT_WINDOW_MS, 900000, 86400000),
    limit: positiveInteger(env.LOGIN_RATE_LIMIT_MAX, 5, 1000),
  };
}

function createLoginRateLimiter(env = process.env) {
  return rateLimit({
    ...loginRateLimitSettings(env),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    identifier: "login",
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.status(429).json({ success: false, message: "Too many login attempts. Please try again later.", errors: [] });
    },
  });
}

module.exports = { createApiRateLimiter, rateLimitSettings, createLoginRateLimiter, loginRateLimitSettings };
