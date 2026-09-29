const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuery } = require('../src/modules/audit/audit.validation');
const service = require('../src/modules/audit/audit.service');
test('audit validation, safe metadata and bound query contracts', async () => {
  for (const params of [{ page: 0 }, { limit: 101 }, { actorUserId: '-1' }, { entityId: 'x' }, { search: 'x'.repeat(201) }, { startDate: '2026-02-30' }, { startDate: '2026-10-01', endDate: '2026-09-01' }, { sortBy: 'password' }]) assert.throws(() => normalizeQuery(params), { statusCode: 422 });
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
  assert.deepEqual(queries[0].params, ['SYSTEM_INITIALIZED', '5', 'USER', '9', '2026-09-01 00:00:00', '2026-10-01 00:00:00', '%a!%%', '%a!%%', 2, 2]);
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
  assert.equal((await get()).status, 401);
  for (const actor of [2, 3]) assert.equal((await get(actor)).status, 403);
  assert.equal((await get(1, '?page=0')).status, 422);
  assert.equal(calls.length, 0);
  const response = await get(1, '?limit=1&action=SYSTEM_INITIALIZED&search=DEMO&startDate=2026-09-01');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data.logs[0].metadata, { isDemo: true });
  assert.equal(body.data.logs[0].actor, null);
  assert.equal(body.data.pagination.total, 1);
  assert.equal(calls.at(-1), 'SET SESSION time_zone = ?');
});
