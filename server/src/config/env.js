// Errors contain variable names, never credential values.
function requireVariables(names, env = process.env) {
  const missing = names.filter(name => typeof env[name] !== "string" || !env[name].trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  const placeholders = names.filter(name => /^(replace_with_|your_|change[-_ ]?me$)/i.test(env[name]));
  if (placeholders.length) throw new Error(`Replace environment placeholders: ${placeholders.join(", ")}`);
}

function validatePort(name, fallback, env = process.env) {
  const value = env[name]?.trim() ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error(`${name} must be an integer between 1 and 65535`);
}

function validateMailConfiguration(env = process.env) {
  requireVariables(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM_ADDRESS"], env);
  validatePort("SMTP_PORT", undefined, env);
  if (!["true", "false"].includes(env.SMTP_SECURE ?? "false")) throw new Error("SMTP_SECURE must be true or false");
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.EMAIL_FROM_ADDRESS.trim()) || /[\r\n]/.test(env.EMAIL_FROM_NAME ?? "")) throw new Error("Invalid email sender configuration");
}

function validateEnvironment() {
  const env = process.env;
  if (env.NODE_ENV && !["development", "test", "production"].includes(env.NODE_ENV)) throw new Error("NODE_ENV must be development, test or production");
  requireVariables(["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_ACCESS_EXPIRES_IN", "JWT_REFRESH_EXPIRES_IN", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]);
  validatePort("PORT", 5000);
  validatePort("DB_PORT", 3306);
  require('./databaseSsl').databaseSsl();
  require("../utils/jwt").validateJwtConfiguration();
  require("./cors").clientOrigin();
  require('./passwordReset').resetLifetime();
  // Email is optional; reject partial configuration when it is enabled.
  if (["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM_ADDRESS"].some(name => env[name]?.trim())) validateMailConfiguration();
}

module.exports = { validateEnvironment, requireVariables, validateMailConfiguration };
