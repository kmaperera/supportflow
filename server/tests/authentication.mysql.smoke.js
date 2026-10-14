// Phase 19.2: real local HTTP/MySQL authentication, rollback-isolated accounts.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/database');
const saved = { query: pool.query, execute: pool.execute, getConnection: pool.getConnection };
let connection, server, stage = 'setup', checks = 0;
const actors = [], credentials = [], warnings = [];
const originalError = console.error, originalWarn = console.warn;
console.error = console.warn = () => warnings.push('Unexpected backend diagnostic');

async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST));
  process.env.NODE_ENV = 'test';
  // Isolate the many invalid-input cases; the existing fresh-app limiter tests
  // exercise the actual five-attempt policy independently.
  process.env.LOGIN_RATE_LIMIT_MAX = '1000';
  connection = await pool.getConnection(); await connection.beginTransaction();
  await connection.query("SET SESSION time_zone='+00:00'");
  let sequence = 0; const savepoints = [];
  const db = {
    query: (...args) => connection.query(...args), execute: (...args) => connection.execute(...args),
    async beginTransaction() { const name = `auth_${++sequence}`; await connection.query(`SAVEPOINT ${name}`); savepoints.push(name); },
    async commit() { await connection.query(`RELEASE SAVEPOINT ${savepoints.pop()}`); },
    async rollback() { if (savepoints.length) { const name = savepoints.pop(); await connection.query(`ROLLBACK TO SAVEPOINT ${name}`); await connection.query(`RELEASE SAVEPOINT ${name}`); } },
    release() {}, destroy() { throw new Error('Unexpected connection destruction'); },
  };
  pool.query = db.query; pool.execute = db.execute; pool.getConnection = async () => db;
  const password = `Auth-${randomUUID()}!`, changedPassword = `Changed-${randomUUID()}!`;
  credentials.push(password, changedPassword);
  const hash = await require('../src/utils/password').hashPassword(password);
  const run = randomUUID().replaceAll('-', '');
  for (const [role, active, forced] of [['EMPLOYEE', true, false], ['TECHNICIAN', true, false], ['ADMIN', true, false], ['EMPLOYEE', false, false], ['EMPLOYEE', true, true]]) {
    const email = `auth-${run}-${actors.length}@example.test`;
    const [row] = await connection.execute("INSERT INTO users (first_name,last_name,email,password_hash,role,is_active,must_change_password) VALUES ('Auth','Fixture',?,?,?,?,?)", [email, hash, role, active, forced]);
    actors.push({ id: String(row.insertId), email, role, active, forced });
  }
  const [employee, technician, admin, inactive, forced] = actors;
  const [start] = await connection.query('SELECT COALESCE(MAX(id),0) AS id FROM audit_logs');
  server = require('../src/app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function request(method, route, body, { token, cookie, status = 200 } = {}) {
    stage = `${method} ${route}`;
    const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    stage += ` expected ${status}, received ${response.status}`;
    assert.equal(response.status, status); checks++;
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const data = await response.json(); assert.equal(data.success, status < 400); assert.equal(typeof data.message, 'string');
    if (status >= 400) { assert.ok(Array.isArray(data.errors)); assert.equal(data.data?.accessToken, undefined); }
    assert.doesNotMatch(JSON.stringify(data), /password_hash|token_hash|JsonWebTokenError|SQLSTATE|stack/);
    const setCookie = response.headers.get('set-cookie');
    return { ...data, setCookie, cookie: setCookie?.split(';')[0] };
  }
  const login = async actor => {
    const result = await request('POST', '/auth/login', { email: actor.email, password });
    assert.equal(result.data.user.role, actor.role); assert.equal(result.data.user.mustChangePassword, actor.forced);
    assert.equal(result.data.refreshToken, undefined);
    const claims = require('../src/utils/jwt').verifyAccessToken(result.data.accessToken);
    assert.deepEqual(Object.keys(claims).sort(), ['exp', 'iat', 'role', 'sub', 'type']);
    assert.equal(claims.sub, actor.id); assert.equal(claims.type, 'access');
    credentials.push(result.data.accessToken, result.cookie.slice('refreshToken='.length));
    assert.match(result.setCookie, /HttpOnly/); assert.match(result.setCookie, /SameSite=Lax/);
    assert.match(result.setCookie, /Path=\/api\/v1\/auth/); assert.doesNotMatch(result.setCookie, /; Secure/);
    return { token: result.data.accessToken, cookie: result.cookie, setCookie: result.setCookie };
  };
  const me = session => request('GET', '/auth/me', undefined, session);
  const refresh = (session, status = 200) => request('POST', '/auth/refresh', {}, { cookie: session.cookie, status });
  const raw = session => session.cookie.slice('refreshToken='.length);
  async function record(session) {
    const [rows] = await connection.execute('SELECT * FROM refresh_tokens WHERE token_hash=?', [require('../src/modules/auth/refreshToken.service').hashRefreshToken(raw(session))]);
    assert.equal(rows.length, 1); return rows[0];
  }
  const sessions = [];
  for (const actor of [employee, technician, admin]) { const session = await login(actor); sessions.push(session); assert.equal(String((await me(session)).data.user.id), actor.id); }
  const [employeeSession, technicianSession, adminSession] = sessions;
  const row = await record(employeeSession), claims = require('../src/utils/jwt').verifyRefreshToken(raw(employeeSession));
  assert.match(row.token_hash, /^[a-f0-9]{64}$/); assert.notEqual(row.token_hash, raw(employeeSession));
  assert.equal(row.expires_at.getTime(), claims.exp * 1000);
  assert.equal(new Date(/Expires=([^;]+)/.exec(employeeSession.setCookie)[1]).getTime(), claims.exp * 1000);

  const [beforeFailures] = await connection.query('SELECT COUNT(*) AS total FROM refresh_tokens');
  const failed = [];
  for (const [email, attempt] of [[employee.email, 'IncorrectFixture123!'], [`absent-${run}@example.test`, password], [inactive.email, password]]) {
    const result = await request('POST', '/auth/login', { email, password: attempt }, { status: 401 }); failed.push({ message: result.message, errors: result.errors });
    assert.equal(result.setCookie, null);
  }
  assert.deepEqual(failed[0], failed[1]); assert.deepEqual(failed[0], failed[2]);
  for (const body of [{}, { email: employee.email }, { password }, { email: 'invalid', password }, { email: '', password: '' }, { email: '   ', password: '   ' }]) {
    assert.equal((await request('POST', '/auth/login', body, { status: 422 })).setCookie, null);
  }
  // Passwords are not trimmed: whitespace-only is a wrong credential, not an
  // invented normalization policy. Email whitespace/case is normalized.
  await request('POST', '/auth/login', { email: employee.email, password: '   ' }, { status: 401 });
  const [afterFailures] = await connection.query('SELECT COUNT(*) AS total FROM refresh_tokens');
  assert.equal(Number(afterFailures[0].total), Number(beforeFailures[0].total));
  const normalized = await request('POST', '/auth/login', { email: '  ' + employee.email.toUpperCase() + '  ', password });
  assert.equal(String(normalized.data.user.id), employee.id);
  const [failedSessions] = await connection.execute('SELECT COUNT(*) AS total FROM refresh_tokens WHERE user_id=?', [inactive.id]); assert.equal(Number(failedSessions[0].total), 0);
  await me({ status: 401 });
  const tampered = employeeSession.token.slice(0, -10) + (employeeSession.token.at(-10) === 'x' ? 'y' : 'x') + employeeSession.token.slice(-9);
  await me({ token: tampered, status: 401 });
  const expiredAccess = jwt.sign({ type: 'access', role: employee.role }, process.env.JWT_ACCESS_SECRET, { subject: employee.id, algorithm: 'HS256', expiresIn: -1 });
  await me({ token: expiredAccess, status: 401 });
  await me({ token: raw(employeeSession), status: 401 });
  await refresh({ cookie: 'refreshToken=' + employeeSession.token }, 401);
  await refresh({}, 401); await refresh({ cookie: 'refreshToken=harmless-invalid-cookie' }, 401);
  const expiredRefresh = jwt.sign({ type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { subject: employee.id, algorithm: 'HS256', expiresIn: -1 });
  await refresh({ cookie: 'refreshToken=' + expiredRefresh }, 401);
  const expiredDb = await login(employee);
  await connection.execute('UPDATE refresh_tokens SET expires_at=? WHERE id=?', [new Date(0), (await record(expiredDb)).id]);
  await refresh(expiredDb, 401);
  const rotated = await refresh(employeeSession);
  assert.notEqual(rotated.cookie, employeeSession.cookie);
  const replacement = { cookie: rotated.cookie, token: rotated.data.accessToken };
  assert.ok((await record(employeeSession)).revoked_at); assert.equal((await record(replacement)).revoked_at, null);
  await refresh(employeeSession, 401); await me(replacement);

  const logout = await request('POST', '/auth/logout', {}, { cookie: replacement.cookie });
  assert.match(logout.setCookie, /Path=\/api\/v1\/auth/); assert.match(logout.setCookie, /HttpOnly/); assert.match(logout.setCookie, /SameSite=Lax/);
  assert.ok(new Date(/Expires=([^;]+)/.exec(logout.setCookie)[1]).getTime() < Date.now());
  assert.ok((await record(replacement)).revoked_at); await refresh(replacement, 401);
  await request('POST', '/auth/logout', {}, { cookie: replacement.cookie }); await request('POST', '/auth/logout', {});
  const pair = [await login(employee), await login(employee)];
  const logoutAll = await request('POST', '/auth/logout-all', {}, { cookie: pair[0].cookie });
  assert.match(logoutAll.setCookie, /Path=\/api\/v1\/auth/); assert.ok(new Date(/Expires=([^;]+)/.exec(logoutAll.setCookie)[1]).getTime() < Date.now());
  for (const session of pair) { assert.ok((await record(session)).revoked_at); await refresh(session, 401); await me(session); }

  const passwordSessions = [await login(employee), await login(employee)];
  const passwordBody = { currentPassword: password, newPassword: changedPassword, confirmPassword: changedPassword };
  await request('PATCH', '/auth/change-password', { ...passwordBody, currentPassword: 'IncorrectFixture123!' }, { token: passwordSessions[0].token, status: 400 });
  await request('PATCH', '/auth/change-password', { currentPassword: password, newPassword: password, confirmPassword: password }, { token: passwordSessions[0].token, status: 400 });
  await request('PATCH', '/auth/change-password', { ...passwordBody, confirmPassword: 'DifferentFixture123!' }, { token: passwordSessions[0].token, status: 400 });
  for (const invalid of ['Short1', 'nocapital123', 'NOLOWERCASE123', 'NoNumbersHere']) await request('PATCH', '/auth/change-password', { currentPassword: password, newPassword: invalid, confirmPassword: invalid }, { token: passwordSessions[0].token, status: 422 });
  assert.equal((await record(passwordSessions[0])).revoked_at, null);
  await request('PATCH', '/auth/change-password', passwordBody, { token: passwordSessions[0].token });
  for (const session of passwordSessions) { assert.ok((await record(session)).revoked_at); await refresh(session, 401); await me(session); }
  await request('POST', '/auth/login', { email: employee.email, password }, { status: 401 });
  await request('POST', '/auth/login', { email: employee.email, password: changedPassword });

  const forcedSession = await login(forced);
  assert.equal((await me(forcedSession)).data.user.mustChangePassword, true);
  await request('GET', '/tickets/categories', undefined, { token: forcedSession.token, status: 403 });
  await request('PATCH', '/auth/change-password', passwordBody, { token: forcedSession.token });
  assert.equal((await me(forcedSession)).data.user.mustChangePassword, false);
  await request('GET', '/tickets/categories', undefined, { token: forcedSession.token }); await refresh(forcedSession, 401);
  await request('POST', '/auth/login', { email: forced.email, password: changedPassword });

  await request('PATCH', `/users/${technician.id}/role`, { role: 'EMPLOYEE' }, { token: adminSession.token });
  assert.equal(require('../src/utils/jwt').verifyAccessToken(technicianSession.token).role, 'TECHNICIAN');
  assert.equal((await me(technicianSession)).data.user.role, 'EMPLOYEE');
  // Admin role updates intentionally revoke refresh sessions; a new login is
  // required. Its subsequent refresh must still use the current DB role.
  await refresh(technicianSession, 401);
  technician.role = 'EMPLOYEE';
  const newRole = await refresh(await login(technician));
  assert.equal(newRole.data.user.role, 'EMPLOYEE'); assert.equal(require('../src/utils/jwt').verifyAccessToken(newRole.data.accessToken).role, 'EMPLOYEE');
  await request('PATCH', `/users/${technician.id}/status`, { isActive: false }, { token: adminSession.token });
  await request('POST', '/auth/login', { email: technician.email, password }, { status: 401 });
  await refresh({ cookie: newRole.cookie }, 401); await me({ token: newRole.data.accessToken, status: 403 });

  const [events] = await connection.execute('SELECT action,metadata,description FROM audit_logs WHERE id>? ORDER BY id', [start[0].id]);
  for (const action of ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGED', 'REFRESH_TOKEN_REJECTED']) assert.ok(events.some(row => row.action === action));
  const serialized = JSON.stringify(events);
  for (const value of credentials) assert.ok(!serialized.includes(value));
  assert.doesNotMatch(serialized, /"(?:password|token|cookie|authorization|password_hash|token_hash)"\s*:/i);
  assert.equal(events.filter(row => row.action === 'PASSWORD_CHANGED').length, 2);
  assert.equal(events.filter(row => row.action === 'LOGOUT').length, 1);
  assert.equal(events.filter(row => row.action === 'LOGOUT_ALL').length, 1);
  assert.equal(savepoints.length, 0); assert.deepEqual(warnings, []);
  console.log(`PASS: ${checks} real HTTP/MySQL auth checks; claims/cookies, generic failures, refresh/hash/rotation, logout, password/session invalidation, forced change, current account/role and audit regression.`);
}
main().catch(() => { originalError('Authentication regression failed at ' + stage + ' (details suppressed).'); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  pool.query = saved.query; pool.execute = saved.execute; pool.getConnection = saved.getConnection;
  if (connection) { try {
    await connection.rollback();
    if (actors.length) for (const [table, column] of [['users', 'id'], ['refresh_tokens', 'user_id'], ['audit_logs', 'actor_user_id']]) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IN (${actors.map(() => '?').join(',')})`, actors.map(actor => actor.id));
      assert.equal(Number(rows[0].total), 0);
    }
    console.log('Rollback verified: fixture accounts, password/role/activity changes and sessions removed; audit writes rolled back.');
  } finally { connection.release(); } }
  console.error = originalError; console.warn = originalWarn; await pool.end();
});
