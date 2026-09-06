require("dotenv").config();

const { hashPassword } = require("../../src/utils/password");
const pool = require("../../src/config/database");

async function seedInitialAdmin() {
  try {
    const requiredVariables = [
      "INITIAL_ADMIN_FIRST_NAME",
      "INITIAL_ADMIN_LAST_NAME",
      "INITIAL_ADMIN_EMAIL",
      "INITIAL_ADMIN_PASSWORD",
    ];
    const missingVariables = requiredVariables.filter(
      (name) => !process.env[name]?.trim()
    );

    if (missingVariables.length > 0) {
      console.error(`Initial admin seed requires: ${missingVariables.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    const firstName = process.env.INITIAL_ADMIN_FIRST_NAME.trim();
    const lastName = process.env.INITIAL_ADMIN_LAST_NAME.trim();
    const email = process.env.INITIAL_ADMIN_EMAIL.trim().toLowerCase();
    const password = process.env.INITIAL_ADMIN_PASSWORD;

    const [users] = await pool.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (users.length > 0) {
      console.log("Initial admin seed skipped: a user with that email already exists.");
      return;
    }

    const passwordHash = await hashPassword(password);

    await pool.execute(
      `INSERT INTO users
        (first_name, last_name, email, password_hash, role, is_active, must_change_password)
       VALUES (?, ?, ?, ?, 'ADMIN', TRUE, TRUE)`,
      [firstName, lastName, email, passwordHash]
    );

    console.log("Initial admin created successfully; password change is required.");
  } catch {
    // Database errors can contain SQL parameters, so do not log the error object.
    console.error("Initial admin seed failed. Check database availability and configuration.");
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      console.error("Initial admin seed failed to close the database pool.");
      process.exitCode = 1;
    }
  }
}

seedInitialAdmin();
