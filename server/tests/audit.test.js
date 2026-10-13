const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuery } = require('../src/modules/audit/audit.validation');
const service = require('../src/modules/audit/audit.service');
test('audit validation, safe metadata and bound query contracts', async () => {
  for (const params of [{ page: 0 }, { limit: 101 }, { actorUserId: '-1' }, { entityId: 'x' }, { search: 'x'.repeat(201) }, { startDate: '2026-02-30' }, { startDate: '2026-10-01', endDate: '2026-09-01' }, { sortBy: 'password' }]) assert.throws(() => normalizeQuery(params), { statusCode: 400 });
  assert.deepEqual(service.safeMetadata({ isDemo: true, schemaVersion: 1, password: 'secret', nested: { token: 'secret' } }), { isDemo: true, schemaVersion: 1 });
  const queries = [];
  const report = await service.getLogs({ page: 2, limit: 2, search: 'a%', action: 'SYSTEM_INITIALIZED', actorUserId: '5', entityType: 'USER', entityId: '9', startDate: '2026-09-01', endDate: '2026-09-30' }, { query: async (sql, params) => {
    queries.push({ sql, params });
    return sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]];
  } });
  assert.equal(report.logs.length, 0);
  assert.equal(report.pagination.page, 2);
  assert.equal(report.pagination.totalPages, 0);
  assert.match(queries[0].sql, /LEFT JOIN users/);
  assert.match(queries[0].sql, /ORDER BY a.created_at DESC, a.id DESC/);
  assert.deepEqual(queries[0].params, [16384, 'SYSTEM_INITIALIZED', '5', 'USER', '9', '2026-09-01 00:00:00', '2026-10-01 00:00:00', '%a!%%', '%a!%%', 2, 2]);
});
test('audit HTTP ADMIN access, denied roles, validation and pagination', async t => {
  const keys = ['JWT_ACCESS_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const saved = keys.map(key => process.env[key]);
  keys.forEach(key => { process.env[key] = 'audit-test'; });
  t.after(() => keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const users = require('../src/modules/users/user.repository');
  t.mock.method(users, 'findById', async id => ({ id, is_active: 1, role: { 1: 'ADMIN', 2: 'EMPLOYEE', 3: 'TECHNICIAN' }[id] }));
  const pool = require('../src/config/database');
  const calls = [];
  t.mock.method(pool, 'getConnection', async () => ({
    query: async (sql, params) => {
      calls.push(sql);
      if (sql.startsWith('SELECT @@')) return [[{ zone: 'SYSTEM' }]];
      if (sql.startsWith('SET')) return [{}];
      if (sql.includes('COUNT(*)')) return [[{ total: 1 }]];
      return [[{ id: '1', actor_user_id: null, action: 'SYSTEM_INITIALIZED', entity_type: null, entity_id: null, description: '[DEMO]', metadata: { isDemo: true, password: 'hidden' }, ip_address: null, created_at: '2026-09-30T00:00:00.000Z' }]];
    }, release() {}, destroy() {},
  }));
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const jwt = require('jsonwebtoken');
  const get = (actor, query = '') => fetch(`http://127.0.0.1:${server.address().port}/api/v1/audit-logs${query}`, { headers: actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: '5m' })}` } : {} });
  const anonymous = await get(undefined, '?limit=invalid');
  assert.equal(anonymous.status, 401); assert.match(anonymous.headers.get('cache-control'), /no-store/);
  for (const actor of [2, 3]) {
    const denied = await get(actor, '?limit=invalid');
    assert.equal(denied.status, 403); assert.match(denied.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await get(1, '?page=0')).status, 400);
  for (const query of ['?limit=10000', '?page=1&page=2', '?startDate=not-a-date', '?startDate=2026-10-02&endDate=2026-10-01', '?sort=password', '?entityType=NOT_REAL', '?action=NOT_REAL', '?includeRaw=true']) {
    const invalid = await get(1, query);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { success: false, message: 'Invalid audit-log query', errors: [] });
  }
  assert.equal(calls.length, 0);
  const response = await get(1, '?limit=1&action=SYSTEM_INITIALIZED&search=DEMO&startDate=2026-09-01');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data.logs[0].metadata, { isDemo: true });
  assert.equal(body.data.logs[0].actor, null);
  assert.equal(body.data.pagination.total, 1);
  assert.equal(calls.at(-1), 'SET SESSION time_zone = ?');
});

test('audit query defaults, full constant allowlists, UTC boundaries and scalar validation', () => {
  assert.deepEqual(normalizeQuery(), { filters: {}, page: 1, limit: 25, offset: 0 });
  assert.deepEqual(normalizeQuery({ page: '2', limit: '100', search: '  ' }), { filters: {}, page: 2, limit: 100, offset: 100 });
  const constants = require('../src/constants/audit');
  for (const action of Object.values(constants.AUDIT_ACTIONS)) assert.equal(normalizeQuery({ action }).filters.action, action);
  for (const entityType of Object.values(constants.AUDIT_ENTITY_TYPES)) assert.equal(normalizeQuery({ entityType }).filters.entityType, entityType);
  assert.deepEqual(normalizeQuery({ startDate: '2024-02-29', endDate: '2024-02-29' }).filters, { startAt: '2024-02-29 00:00:00', endExclusive: '2024-03-01 00:00:00' });
  assert.equal(normalizeQuery({ actorUserId: '18446744073709551615', entityId: '9007199254740993' }).filters.entityId, '9007199254740993');
  for (const query of [{ page: null }, { limit: null }, { page: ['1', '2'] }, { limit: {} }, { page: Number.MAX_SAFE_INTEGER, limit: 100 },
    { entityId: '18446744073709551616' }, { actorUserId: 9007199254740992 }, { action: 'login_success' }, { action: "' OR 1=1 --" },
    { entityType: [] }, { search: {} }, { startDate: ['2026-10-01'] }, { startDate: '2026-02-29' }, { endDate: '9999-12-31' }, { outcome: 'FAILURE' }, { order: 'ASC' }]) {
    assert.throws(() => normalizeQuery(query), { statusCode: 400 });
  }
});

test('audit search is literal, list/count predicates match, and responses omit raw row/legacy secrets', async () => {
  const queries = [];
  const search = "' OR 1=1 -- %_!";
  const result = await service.getLogs({ search, action: 'LOGIN_SUCCESS', entityType: 'AUTH', limit: 5 }, { query: async (sql, params) => {
    queries.push({ sql, params });
    return sql.includes('COUNT(*)') ? [[{ total: 1 }]] : [[{ id: '9007199254740993', actor_user_id: null, entity_id: null, action: 'LOGIN_SUCCESS', entity_type: 'AUTH',
      metadata: JSON.stringify({ sessionsRevoked: true, password: 'test-only-sensitive', accessToken: 'test-only-sensitive', refreshToken: 'test-only-sensitive', authorization: 'test-only-sensitive', cookie: 'test-only-sensitive', apiSecret: 'test-only-sensitive', nested: { dbPassword: 'test-only-sensitive' } }),
      password_hash: 'test-only-sensitive', arbitrary: 'test-only-sensitive', created_at: '2026-10-14T00:00:00.000Z' }]];
  } });
  assert.deepEqual(queries[0].params.slice(1, -2), queries[1].params);
  assert.equal(queries[0].sql.slice(queries[0].sql.indexOf(' WHERE '), queries[0].sql.indexOf(' ORDER BY')).trim(), queries[1].sql.slice(queries[1].sql.indexOf(' WHERE ')).trim());
  assert.ok(!queries[0].sql.includes(search)); assert.match(queries[0].sql, /CASE WHEN OCTET_LENGTH/);
  assert.ok(!queries[0].sql.includes('password_hash')); assert.ok(!queries[0].sql.includes('u.*'));
  assert.deepEqual(result.logs[0].metadata, { sessionsRevoked: true });
  assert.equal(result.logs[0].actor, null); assert.equal(result.logs[0].id, '9007199254740993');
  assert.ok(!JSON.stringify(result).includes('test-only-sensitive'));
  for (const value of ['{broken', '', 'null', '[]', JSON.stringify({ name: 'x'.repeat(20000) })]) assert.equal(service.safeMetadata(value), null);
  const empty = await service.getLogs({ page: 5 }, { query: async sql => sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]] });
  assert.deepEqual(empty, { logs: [], pagination: { page: 5, limit: 25, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });
});
