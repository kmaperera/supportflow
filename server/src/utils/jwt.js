const jwt = require("jsonwebtoken");

function validateAccessTokenConfig(requireExpiry = true) {
  const requiredVariables = ["JWT_ACCESS_SECRET"];
  if (requireExpiry) {
    requiredVariables.push("JWT_ACCESS_EXPIRES_IN");
  }

  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name]?.trim()
  );
  if (missingVariables.length > 0) {
    throw new Error(`Missing JWT configuration: ${missingVariables.join(", ")}`);
  }
}

function generateAccessToken(user) {
  if (!user || user.id == null || !String(user.id).trim() ||
      typeof user.role !== "string" || !user.role.trim()) {
    throw new TypeError("User id and role are required to generate an access token");
  }

  validateAccessTokenConfig();

  return jwt.sign(
    { role: user.role },
    process.env.JWT_ACCESS_SECRET,
    {
      subject: String(user.id),
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      algorithm: "HS256",
    }
  );
}

function verifyAccessToken(token) {
  validateAccessTokenConfig(false);

  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });
}

module.exports = { generateAccessToken, verifyAccessToken };
