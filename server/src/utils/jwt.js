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
    { role: user.role, type: "access" },
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

  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });
  // Refresh credentials must never authorize API requests, even if deployment
  // secrets were accidentally configured identically.
  // Accept pre-18.9 untyped access tokens until their existing expiry, but never
  // any explicitly different token type. Newly issued access tokens are typed.
  if (decoded.type !== undefined && decoded.type !== "access") throw new jwt.JsonWebTokenError("Invalid access token type");
  validateClaims(decoded);
  return decoded;
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
  validateClaims(decoded);
  return decoded;
}

function validateClaims(decoded) {
  if (!decoded || !Number.isSafeInteger(decoded.exp) ||
      typeof decoded.sub !== "string" || !/^[1-9]\d*$/.test(decoded.sub) ||
      decoded.sub.length > 20 || BigInt(decoded.sub) > 18446744073709551615n) {
    throw new jwt.JsonWebTokenError("Invalid token claims");
  }
}

function validateJwtConfiguration() {
  validateAccessTokenConfig();
  validateRefreshTokenConfig();
  const access = process.env.JWT_ACCESS_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;
  if (process.env.NODE_ENV === "production") {
    const weak = value => value.length < 32 || new Set(value).size < 8 ||
      /^(secret|changeme|development-secret|123456|replace[-_ ]?me)/i.test(value);
    if (access === refresh || weak(access) || weak(refresh)) {
      throw new Error("Production JWT secrets must be distinct, strong random values of at least 32 characters");
    }
  }
  // Use the JWT library's own duration semantics; no second TTL parser.
  try {
    const lifetime = (secret, expiresIn) => {
      const token = jwt.sign({}, secret, { algorithm: "HS256", expiresIn });
      const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
      if (!Number.isSafeInteger(claims.exp) || claims.exp <= claims.iat) throw new Error();
      return claims.exp - claims.iat;
    };
    if (lifetime(refresh, process.env.JWT_REFRESH_EXPIRES_IN) <= lifetime(access, process.env.JWT_ACCESS_EXPIRES_IN)) throw new Error();
  } catch {
    throw new Error("JWT lifetimes must be positive finite durations with refresh longer than access");
  }
}

module.exports = {
  generateAccessToken, verifyAccessToken,
  generateRefreshToken, verifyRefreshToken,
  validateJwtConfiguration,
};

