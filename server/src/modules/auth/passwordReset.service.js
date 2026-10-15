const { randomBytes, createHash } = require('node:crypto');
const pool = require('../../config/database');
const users = require('../users/user.repository');
const repository = require('./passwordReset.repository');
const sessions = require('./refreshToken.repository');
const email = require('../../services/email.service');
const { hashPassword } = require('../../utils/password');
const { clientOrigin } = require('../../config/cors');
const { buildPasswordResetEmail } = require('./passwordReset.email');
const ApiError = require('../../utils/ApiError');
const audit = require('../audit/audit.service');
const { AUDIT_ACTIONS: A, AUDIT_ENTITY_TYPES: E } = require('../../constants/audit');
const active = user => user && [true, 1, '1'].includes(user.is_active);
const hashToken = token => createHash('sha256').update(token).digest('hex');
const pending = new Set();
const { resetLifetime } = require('../../config/passwordReset');
const GENERIC_MESSAGE = 'If an account exists for that email, password reset instructions have been sent.';

async function sendInstructions(userId, context, adminRequest = false) {
  const minutes = resetLifetime();
  const link = new URL('/reset-password', clientOrigin());
  const token = randomBytes(32).toString('hex');
  link.searchParams.set('token', token);
  const connection = await pool.getConnection();
  let resetId, user;
  try {
    await connection.beginTransaction();
    user = await repository.lockUser(userId, connection);
    if (!user) throw new ApiError(404, 'User not found');
    if (!active(user)) throw new ApiError(400, 'Password reset is unavailable for inactive users');
    await repository.invalidateForUser(user.id, connection);
    resetId = await repository.create(user.id, hashToken(token), minutes, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  try {
    await email.sendEmail({ to: user.email, ...buildPasswordResetEmail({ firstName: user.first_name, link: link.href, minutes }) });
  } catch {
    // Invalidate only this delivery attempt, never a newer request's token.
    await repository.invalidateById(resetId);
    throw new ApiError(502, 'Unable to send password reset instructions. Please try again.');
  }
  if (adminRequest) await audit.log({ actorUserId: context.actorUserId, action: A.ADMIN_PASSWORD_RESET_REQUESTED,
    entityType: E.USER, entityId: user.id, ipAddress: context.ipAddress });
}

// Public response never waits for lookup or SMTP. This small in-process task is
// best-effort delivery, not a durable mail queue; users can request another link.
function requestPasswordReset(emailAddress, context = {}) {
  const task = new Promise(resolve => setImmediate(resolve)).then(async () => {
    await audit.log({ actorUserId: null, action: A.PASSWORD_RESET_REQUESTED, entityType: E.AUTH, entityId: null, ipAddress: context.ipAddress });
    const user = await users.findByEmail(emailAddress.trim().toLowerCase());
    if (active(user)) await sendInstructions(user.id, context);
  }).catch(() => { console.error('Password reset request delivery failed'); }).finally(() => pending.delete(task));
  pending.add(task);
}
async function drainPendingRequests() { await Promise.all([...pending]); }

async function resetPassword(token, newPassword, context = {}) {
  const invalid = () => new ApiError(400, 'Password reset link is invalid or expired. Request a new link.');
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalid();
  const tokenHash = hashToken(token), candidate = await repository.findUsable(tokenHash);
  if (!candidate) throw invalid();
  const passwordHash = await hashPassword(newPassword);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Issue and consume always lock the user first: concurrent requests/resets
    // cannot consume an older token or change the password twice.
    const user = await repository.lockUser(candidate.user_id, connection);
    const stored = await repository.findUsable(tokenHash, connection, true);
    if (!active(user) || !stored || String(stored.user_id) !== String(user.id)) throw invalid();
    await users.updatePassword(user.id, passwordHash, connection);
    await repository.invalidateForUser(user.id, connection);
    await sessions.revokeAllForUser(user.id, connection);
    await audit.log({ actorUserId: user.id, action: A.PASSWORD_RESET_COMPLETED, entityType: E.USER, entityId: user.id,
      ipAddress: context.ipAddress, metadata: { sessionsRevoked: true } }, { connection, strict: true });
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { GENERIC_MESSAGE, requestPasswordReset, resetPassword, sendInstructions, drainPendingRequests, resetLifetime };
