const nodemailer = require("nodemailer");
const ApiError = require("../utils/ApiError");

let transporter;

function getDefaultFrom() {
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  const name = process.env.EMAIL_FROM_NAME?.trim() || "SupportFlow";
  if (!address || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) || /[\r\n]/.test(name)) {
    throw new ApiError(500, "Invalid email sender configuration");
  }
  // Nodemailer formats and escapes structured addresses safely.
  return { name, address };
}

function getMailerTransporter() {
  if (transporter) return transporter;
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM_ADDRESS"];
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new ApiError(500, `Missing required mail configuration: ${missing.join(", ")}`);
  const portValue = process.env.SMTP_PORT.trim();
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiError(500, "SMTP_PORT must be an integer between 1 and 65535");
  }
  const secureValue = process.env.SMTP_SECURE ?? "false";
  if (!["true", "false"].includes(secureValue)) throw new ApiError(500, "SMTP_SECURE must be true or false");
  getDefaultFrom();
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(), port, secure: secureValue === "true",
      auth: { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS },
    });
  } catch {
    throw new ApiError(500, "Email transport configuration failed");
  }
  return transporter;
}

async function verifyMailerConnection() {
  const transport = getMailerTransporter();
  try {
    await transport.verify();
    return true;
  } catch {
    throw new ApiError(502, "Email server connection verification failed");
  }
}

module.exports = { getMailerTransporter, getDefaultFrom, verifyMailerConnection };
