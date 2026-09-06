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

function validateRefreshTokenConfig(requireExpiry = true) {
  const required = ["JWT_REFRESH_SECRET"];
  if (requireExpiry) required.push("JWT_REFRESH_EXPIRES_IN");
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing JWT configuration: ${missing.join(", ")}`);
  }
}

function generateRefreshToken(userId) {
  const validId =
    (typeof userId === "number" && Number.isSafeInteger(userId) && userId > 0) ||
    (typeof userId === "string" && /^[1-9]\d*$/.test(userId)) ||
    (typeof userId === "bigint" && userId > 0n);
  if (!validId) throw new TypeError("A valid user id is required");

  validateRefreshTokenConfig();
  return jwt.sign({ type: "refresh" }, process.env.JWT_REFRESH_SECRET, {
    subject: String(userId),
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    algorithm: "HS256",
    // Distinguish tokens issued to the same user within the same second.
    jwtid: require("node:crypto").randomUUID(),
  });
}

function verifyRefreshToken(token) {
  validateRefreshTokenConfig(false);
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"],
  });
  if (decoded.type !== "refresh") {
    throw new jwt.JsonWebTokenError("Invalid refresh token type");
  }
  return decoded;
}

module.exports = {
  generateAccessToken, verifyAccessToken,
  generateRefreshToken, verifyRefreshToken,
};

