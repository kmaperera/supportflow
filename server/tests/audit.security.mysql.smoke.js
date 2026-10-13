// Explicit local HTTP/MySQL verification; outer rollback preserves all existing
// users, passwords, sessions and audit history. Service transactions use savepoints.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const pool = require('../src/config/database');
const { hashPassword } = require('../src/utils/password');
let connection, server;
const original = { query: pool.query, execute: pool.execute, getConnection: pool.getConnection };

async function main() {
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error();
  process.env.NODE_ENV = 'test';
  connection = await pool.getConnection(); await connection.beginTransaction();
  let sequence = 0; const savepoints = [];
  const db = {
    query: (...args) => connection.query(...args), execute: (...args) => connection.execute(...args),
    async beginTransaction() { const name = `security_test_${++sequence}`; await connection.query(`SAVEPOINT ${name}`); savepoints.push(name); },
    async commit() { await connection.query(`RELEASE SAVEPOINT ${savepoints.pop()}`); },
    async rollback() { if (savepoints.length) { const name = savepoints.pop(); await connection.query(`ROLLBACK TO SAVEPOINT ${name}`); await connection.query(`RELEASE SAVEPOINT ${name}`); } },
    release() {}, destroy() { throw new Error('Test connection must remain open'); },
  };
  pool.query = db.query; pool.execute = db.execute; pool.getConnection = async () => db;
  const [baseline] = await connection.query('SELECT COALESCE(MAX(id),0) AS id FROM audit_logs');
  const run = randomUUID().replaceAll('-', '');
  const password = `Fixture-${randomUUID()}!`, newPassword = `Changed-${randomUUID()}!`;
  const hash = await hashPassword(password);
  const users = [];
  for (const [role, forced] of [['ADMIN', false], ['EMPLOYEE', true]]) {
    const email = `security-${run}-${users.length}@example.test`;
    const [result] = await connection.execute(`INSERT INTO users
      (first_name,last_name,email,password_hash,role,is_active,must_change_password)
      VALUES ('Security','Fixture',?,?,?,TRUE,?)`, [email, hash, role, forced]);
    users.push({ id: String(result.insertId), email, role });
  }
  const [admin, user] = users;
  const app = require('../src/app'); server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const tokens = require('../src/utils/jwt');
  const adminToken = tokens.generateAccessToken(admin);
  async function request(path, { body, cookie, token, method = 'POST', status = 200 } = {}) {
    const result = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(result.status, status, 'Unexpected security integration response status');
    return { body: await result.json(), cookie: result.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = values => request('/auth/login', { body: { email: user.email, password, ...values } });
  async function rows() {
    const [result] = await connection.execute('SELECT CAST(actor_user_id AS CHAR) AS actor_user_id, action, entity_type, CAST(entity_id AS CHAR) AS entity_id, metadata, ip_address FROM audit_logs WHERE id > ? ORDER BY id', [baseline[0].id]);
    return result.map(row => ({ ...row, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata }));
  }
  const session = await login(); assert.ok(session.cookie); assert.ok(session.body.data.accessToken);
  const failures = [];
  for (const body of [{ email: user.email, password: `Wrong-${run}!` }, { email: `missing-${run}@example.test`, password }]) {
    failures.push((await request('/auth/login', { body, status: 401 })).body);
  }
  await connection.execute('UPDATE users SET is_active=FALSE WHERE id=?', [user.id]);
  failures.push((await request('/auth/login', { body: { email: user.email, password }, status: 401 })).body);
  assert.deepEqual(failures[0], failures[1]); assert.deepEqual(failures[1], failures[2]);
  await connection.execute('UPDATE users SET is_active=TRUE WHERE id=?', [user.id]);
  const beforeRefresh = (await rows()).length;
  const rotated = await request('/auth/refresh', { cookie: session.cookie });
  assert.equal((await rows()).length, beforeRefresh);
  await request('/auth/refresh', { cookie: session.cookie, status: 401 });
  const beforeNoise = (await rows()).length;
  await request('/auth/refresh', { status: 401 });
  await request('/auth/refresh', { cookie: 'refreshToken=invalid-fixture', status: 401 });
  const expired = require('jsonwebtoken').sign({ type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { subject: user.id, expiresIn: -1 });
  await request('/auth/refresh', { cookie: `refreshToken=${expired}`, status: 401 });
  assert.equal((await rows()).length, beforeNoise);
  await request('/auth/logout', { cookie: rotated.cookie });
  const afterLogout = (await rows()).length;
  await request('/auth/logout', { cookie: rotated.cookie }); await request('/auth/logout');
  assert.equal((await rows()).length, afterLogout);
  const first = await login(), second = await login();
  await request('/auth/logout-all', { cookie: first.cookie });
  assert.deepEqual((await rows()).at(-1).metadata, { revokedSessionCount: 2 });
  await request('/auth/logout-all', { cookie: second.cookie, status: 401 });
  const changing = await login();
  const beforePassword = (await rows()).length;
  await request('/auth/change-password', { method: 'PATCH', token: changing.body.data.accessToken, status: 400,
    body: { currentPassword: `Wrong-${run}!`, newPassword, confirmPassword: newPassword } });
  assert.equal((await rows()).length, beforePassword);
  await request('/auth/change-password', { method: 'PATCH', token: changing.body.data.accessToken,
    body: { currentPassword: password, newPassword, confirmPassword: newPassword } });
  assert.deepEqual((await rows()).at(-1).metadata, { sessionsRevoked: true, forcedChange: true });
  await request('/auth/refresh', { cookie: changing.cookie, status: 401 });
  const [active] = await connection.execute('SELECT COUNT(*) AS total FROM refresh_tokens WHERE user_id=? AND revoked_at IS NULL', [user.id]);
  assert.equal(Number(active[0].total), 0);
  const changed = await login({ password: newPassword });
  await connection.execute('UPDATE users SET is_active=FALSE WHERE id=?', [user.id]);
  const inactive = await request('/auth/refresh', { cookie: changed.cookie, status: 401 });
  assert.equal(inactive.body.message, 'Invalid refresh token');
  assert.deepEqual((await rows()).at(-1).metadata, { reasonCode: 'ACCOUNT_INACTIVE' });
  await connection.execute('UPDATE users SET is_active=TRUE WHERE id=?', [user.id]);
  const beforeAdmin = (await rows()).length;
  await request(`/users/${user.id}/status`, { method: 'PATCH', token: adminToken, body: { isActive: false } });
  const events = await rows();
  assert.equal(events.length, beforeAdmin + 1); assert.equal(events.at(-1).action, 'USER_DEACTIVATED');
  assert.equal(events.at(-1).actor_user_id, admin.id);
  for (const event of events) {
    if (event.action === 'LOGIN_FAILED') { assert.equal(event.actor_user_id, null); assert.equal(event.entity_id, null); }
    else if (event.action === 'REFRESH_TOKEN_REJECTED') { assert.equal(event.actor_user_id, null); assert.equal(event.entity_id, user.id); }
    else if (event.action !== 'USER_DEACTIVATED') { assert.equal(event.actor_user_id, user.id); assert.equal(event.entity_id, user.id); }
    assert.ok(['127.0.0.1', '::ffff:127.0.0.1'].includes(event.ip_address));
  }
  assert.equal(events.filter(event => event.action === 'LOGOUT').length, 1);
  assert.equal(events.filter(event => event.action === 'LOGOUT_ALL').length, 1);
  assert.equal(events.filter(event => event.action === 'PASSWORD_CHANGED').length, 1);
  assert.equal(events.filter(event => event.action === 'LOGIN_FAILED').length, 3);
  const serialized = JSON.stringify(events);
  for (const value of [password, newPassword, hash, user.email, changing.cookie, changing.body.data.accessToken, expired]) assert.ok(!serialized.includes(value));
  const viewer = await request('/audit-logs?action=PASSWORD_CHANGED', { method: 'GET', token: adminToken });
  const event = viewer.body.data.logs.find(row => row.entityId === user.id);
  assert.ok(event); assert.deepEqual(event.metadata, { sessionsRevoked: true, forcedChange: true });
  console.log(`PASS: ${events.length} real local security/admin audit rows verified; all six security action types, generic auth responses, session invalidation, replay/noise policy, exact actors, secret exclusion and viewer metadata.`);
}
main().catch(() => { console.error('Security audit MySQL integration failed (details suppressed).'); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  pool.query = original.query; pool.execute = original.execute; pool.getConnection = original.getConnection;
  if (connection) { try { await connection.rollback(); console.log('All security integration fixtures, passwords, sessions and audit rows rolled back.'); } finally { connection.release(); } }
  await pool.end();
});
