const { escapeHtml } = require('../notifications/notificationEmailTemplates');

function buildPasswordResetEmail({ firstName, link, minutes }) {
  const name = firstName || 'there';
  return {
    subject: 'SupportFlow password reset',
    text: `Hello ${name},\n\nReset your SupportFlow password: ${link}\n\nThis link expires in ${minutes} minutes and can be used once. If you did not request this, ignore this email.`,
    html: `<h1>SupportFlow</h1><h2>Password Reset Request</h2><p>Hello ${escapeHtml(name)},</p><p><a href="${escapeHtml(link)}">Reset your password</a></p><p>This link expires in ${minutes} minutes and can be used once.</p><p>If you did not request this, ignore this email.</p>`,
  };
}
module.exports = { buildPasswordResetEmail };
