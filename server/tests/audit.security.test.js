const { test } = require('node:test');
const assert = require('node:assert/strict');

test('security audit records actual auth outcomes without credentials or extra noise', async t => {
  // Deliberate spoofed forwarding header triggers the limiter's existing warning.
  t.mock.method(console, 'error', () => {});
  const { app, user, records, auditEvents } = await require('./helpers/cookieApp')();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const credentials = { email: user.email, password: 'CookieFixture123!' };
  const post = (path, body, cookie, token, method = 'POST') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Forwarded-For': '203.0.113.9', 'User-Agent': 'test-only-secret-agent' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = () => post('/login', credentials);
  const cookie = response => response.headers.get('set-cookie').split(';')[0];
  const count = action => auditEvents.filter(event => event.action === action).length;
  let response, session;

  await t.test('login success is recorded after session establishment with trusted actor/IP', async () => {
    response = await login(); assert.equal(response.status, 200); session = cookie(response);
    assert.equal(records.length, 1); assert.equal(count('LOGIN_SUCCESS'), 1);
    const event = auditEvents.at(-1);
    assert.equal(event.actorUserId, '1'); assert.equal(event.entityId, '1'); assert.equal(event.entityType, 'AUTH');
    assert.equal(event.ipAddress, '127.0.0.1'); assert.equal(event.metadata, null);
    assert.ok(!JSON.stringify(event).includes('203.0.113.9'));
  });
  await t.test('wrong, unknown and inactive logins have identical status/body and anonymous minimal events', async () => {
    const failures = [];
    for (const values of [{ ...credentials, password: 'WrongFixture123!' }, { email: 'missing@example.test', password: 'WrongFixture123!' }, { email: 'inactive@example.com', password: credentials.password }]) {
      const result = await post('/login', values); assert.equal(result.status, 401);
      assert.equal(result.headers.get('set-cookie'), null); failures.push(await result.json());
    }
    assert.deepEqual(failures[0], failures[1]); assert.deepEqual(failures[1], failures[2]);
    assert.equal(count('LOGIN_FAILED'), 3);
    for (const event of auditEvents.filter(event => event.action === 'LOGIN_FAILED')) {
      assert.equal(event.actorUserId, null); assert.equal(event.entityId, null);
      assert.equal(event.entityType, 'AUTH'); assert.deepEqual(Object.keys(event.metadata), ['reasonCode']);
    }
    assert.equal(auditEvents.at(-1).metadata.reasonCode, 'ACCOUNT_INACTIVE');
  });
  await t.test('valid refresh is quiet; known revoked replay is logged but malformed/absent/expired/unknown tokens are not', async () => {
    const previousCount = auditEvents.length;
    const refreshed = await post('/refresh', undefined, session); assert.equal(refreshed.status, 200);
    assert.equal(auditEvents.length, previousCount);
    const replacement = cookie(refreshed);
    assert.equal((await post('/refresh', undefined, session)).status, 401);
    assert.equal(count('REFRESH_TOKEN_REJECTED'), 1);
    assert.deepEqual(auditEvents.at(-1).metadata, { reasonCode: 'SESSION_NOT_ACTIVE' });
    assert.equal(auditEvents.at(-1).actorUserId, null);
    const tokens = require('../src/utils/jwt');
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign({ type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { subject: '1', expiresIn: -1 });
    const unknown = tokens.generateRefreshToken(1);
    for (const value of [undefined, 'refreshToken=invalid-fixture', `refreshToken=${expired}`, `refreshToken=${unknown}`, `refreshToken=${tokens.generateAccessToken(user)}`]) {
      assert.equal((await post('/refresh', undefined, value)).status, 401);
    }
    assert.equal(count('REFRESH_TOKEN_REJECTED'), 1);
    // A cookie can expire between verification and atomic consumption. Treat
    // that boundary as normal expiry, rather than a replay audit event.
    let clock;
    const rotate = t.mock.method(require('../src/modules/auth/refreshToken.repository'), 'rotate', async () => {
      clock = t.mock.method(Date, 'now', () => Date.parse('2100-01-01T00:00:00Z'));
      return false;
    });
    try {
      const raw = decodeURIComponent(replacement.slice('refreshToken='.length));
      await assert.rejects(require('../src/modules/auth/refreshToken.service').rotateRefreshToken(raw, { ipAddress: '127.0.0.1' }), { statusCode: 401 });
      assert.equal(count('REFRESH_TOKEN_REJECTED'), 1);
    } finally { clock?.mock.restore(); rotate.mock.restore(); }
    user.is_active = 0;
    assert.equal((await post('/refresh', undefined, replacement)).status, 401);
    assert.deepEqual(auditEvents.at(-1).metadata, { reasonCode: 'ACCOUNT_INACTIVE' });
    user.is_active = 1; session = replacement;
  });
  await t.test('logout logs only an actually revoked session; repeat/anonymous logout remains idempotent', async () => {
    const result = await post('/logout', undefined, session); assert.equal(result.status, 200);
    assert.match(result.headers.get('set-cookie'), /HttpOnly/);
    assert.equal(count('LOGOUT'), 1); assert.equal(auditEvents.at(-1).actorUserId, '1');
    for (const value of [session, undefined, 'refreshToken=invalid-fixture']) assert.equal((await post('/logout', undefined, value)).status, 200);
    assert.equal(count('LOGOUT'), 1);
  });
  await t.test('logout-all records one event with accurate revoked count; invalid calls record no success', async () => {
    const first = cookie(await login()); const second = cookie(await login());
    assert.equal((await post('/logout-all', undefined, first)).status, 200);
    assert.equal(count('LOGOUT_ALL'), 1);
    assert.deepEqual(auditEvents.at(-1).metadata, { revokedSessionCount: 2 });
    assert.equal((await post('/logout-all', undefined, second)).status, 401);
    assert.equal(count('LOGOUT_ALL'), 1);
    assert.ok(records.every(record => record.revoked_at));
  });
  await t.test('forced password change logs only after update/revocation commit and excludes old/new/hash data', async () => {
    user.must_change_password = 1;
    const signedIn = await login(); const body = await signedIn.json(); const active = cookie(signedIn);
    const repository = require('../src/modules/users/user.repository');
    const transaction = [];
    t.mock.method(repository, 'updatePassword', async (id, hash) => { transaction.push('password'); user.password_hash = hash; user.must_change_password = 0; });
    t.mock.method(require('../src/config/database'), 'getConnection', async () => ({ async beginTransaction() {}, async commit() { transaction.push('commit'); }, async rollback() {}, release() {} }));
    const invalid = await post('/change-password', { currentPassword: 'WrongFixture123!', newPassword: 'ChangedFixture123!', confirmPassword: 'ChangedFixture123!' }, undefined, body.data.accessToken, 'PATCH');
    assert.equal(invalid.status, 400); assert.equal(count('PASSWORD_CHANGED'), 0);
    const result = await post('/change-password', { currentPassword: credentials.password, newPassword: 'ChangedFixture123!', confirmPassword: 'ChangedFixture123!' }, undefined, body.data.accessToken, 'PATCH');
    assert.equal(result.status, 200); assert.deepEqual(transaction, ['password', 'commit']);
    assert.equal(count('PASSWORD_CHANGED'), 1);
    assert.deepEqual(auditEvents.at(-1).metadata, { sessionsRevoked: true, forcedChange: true });
    assert.equal(auditEvents.at(-1).entityType, 'USER');
    assert.equal((await post('/refresh', undefined, active)).status, 401);
    credentials.password = 'ChangedFixture123!';
  });
  await t.test('audit DB failure does not reject established auth sessions and never logs raw errors', async () => {
    const messages = [];
    t.mock.method(console, 'error', (...args) => messages.push(args.join(' ')));
    t.mock.method(require('../src/modules/audit/audit.repository'), 'create', async () => { throw new Error('test-only-sensitive SQL credentials'); });
    const result = await login(); assert.equal(result.status, 200); assert.ok(cookie(result));
    assert.equal((await post('/logout', undefined, cookie(result))).status, 200);
    assert.ok(messages.length > 0); assert.ok(!messages.join(' ').includes('test-only-sensitive'));
  });
  const serialized = JSON.stringify(auditEvents);
  for (const value of ['CookieFixture123!', 'ChangedFixture123!', 'WrongFixture123!', user.password_hash, 'test-only-secret-agent', user.email, session, 'Authorization', 'Cookie']) assert.ok(!serialized.includes(value));
});

test('failed auth session creation cannot produce LOGIN_SUCCESS', async t => {
  const { app, auditEvents } = await require('./helpers/cookieApp')();
  t.mock.method(require('../src/modules/auth/refreshToken.repository'), 'create', async () => { throw new Error('test session persistence failure'); });
  t.mock.method(console, 'error', () => {});
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'cookie@example.com', password: 'CookieFixture123!' }) });
  assert.equal(response.status, 500); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(auditEvents.length, 0);
});

test('failed logout revocation or password transaction cannot produce success events', async t => {
  const { app, auditEvents } = await require('./helpers/cookieApp')();
  const tokens = require('../src/modules/auth/refreshToken.repository');
  t.mock.method(console, 'error', () => {});
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const signedIn = await fetch(url + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'cookie@example.com', password: 'CookieFixture123!' }) });
  const cookie = signedIn.headers.get('set-cookie').split(';')[0];
  const body = await signedIn.json();
  t.mock.method(tokens, 'revokeById', async () => { throw new Error('test revocation failure'); });
  const logout = await fetch(url + '/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logout.status, 500); assert.equal(logout.headers.get('set-cookie'), null);
  let rolledBack = false;
  t.mock.method(require('../src/config/database'), 'getConnection', async () => ({ async beginTransaction() {}, async commit() { assert.fail('Failed revocation must not commit'); }, async rollback() { rolledBack = true; }, release() {} }));
  t.mock.method(require('../src/modules/users/user.repository'), 'updatePassword', async () => {});
  t.mock.method(tokens, 'revokeAllForUser', async () => { throw new Error('test revocation failure'); });
  const changed = await fetch(url + '/change-password', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.data.accessToken}` }, body: JSON.stringify({ currentPassword: 'CookieFixture123!', newPassword: 'ChangedFixture123!', confirmPassword: 'ChangedFixture123!' }) });
  assert.equal(changed.status, 500); assert.ok(rolledBack); assert.equal(changed.headers.get('set-cookie'), null);
  assert.deepEqual(auditEvents.map(event => event.action), ['LOGIN_SUCCESS']);
});
