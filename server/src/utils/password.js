const bcrypt = require("bcryptjs");

async function hashPassword(plainPassword) {
  if (typeof plainPassword !== "string" || plainPassword.length === 0) {
    throw new TypeError("Password must be a non-empty string");
  }

  return bcrypt.hash(plainPassword, 12);
}

async function comparePassword(plainPassword, passwordHash) {
  if (
    typeof plainPassword !== "string" || plainPassword.length === 0 ||
    typeof passwordHash !== "string" || passwordHash.length === 0
  ) {
    throw new TypeError("Password and password hash must be non-empty strings");
  }

  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword };
