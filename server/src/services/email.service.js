const mailer = require("../config/mailer");
const ApiError = require("../utils/ApiError");

function stringValue(value, name, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new ApiError(422, `${name} must be a non-empty string`);
  return value.trim();
}

async function sendEmail({ to, subject, text, html, replyTo } = {}) {
  to = stringValue(to, "Email recipient", true);
  subject = stringValue(subject, "Email subject", true);
  text = stringValue(text, "Email text");
  html = stringValue(html, "Email HTML");
  replyTo = stringValue(replyTo, "Reply-to address");
  if (!text && !html) throw new ApiError(422, "Email text or HTML is required");
  if ([to, subject, replyTo].some(value => value && /[\r\n]/.test(value))) {
    throw new ApiError(422, "Email headers must not contain line breaks");
  }
  const transport = mailer.getMailerTransporter();
  const from = mailer.getDefaultFrom();
  try {
    const info = await transport.sendMail({ from, to, subject, text, html, replyTo });
    return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
  } catch {
    throw new ApiError(502, "Email delivery failed");
  }
}

module.exports = { sendEmail };
