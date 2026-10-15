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
  try { require("./env").validateMailConfiguration(); }
  catch { throw new ApiError(500, "Invalid email transport configuration"); }
  const port = Number(process.env.SMTP_PORT.trim());
  const secureValue = process.env.SMTP_SECURE ?? "false";
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
  } catch (error) {
    require('../utils/emailDiagnostic').logEmailFailure('verify', error);
    throw new ApiError(502, "Email server connection verification failed");
  }
}

module.exports = { getMailerTransporter, getDefaultFrom, verifyMailerConnection };
