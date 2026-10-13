const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/modules/audit/audit.service');
const repository = require('../src/modules/audit/audit.repository');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require('../src/constants/audit');
const { sanitizeMetadata, MAX_METADATA_BYTES } = require('../src/modules/audit/audit.metadata');
const base = { action: AUDIT_ACTIONS.LOGIN_FAILED, entityType: AUDIT_ENTITY_TYPES.AUTH };

test('trusted writer normalizes null actors/entities and binds fixed SQL columns', async () => {
  const calls = [];
  const db = { execute: async (sql, values) => { calls.push({ sql, values }); return [{ insertId: '9007199254740993' }]; } };
  const result = await service.log({ ...base, metadata: { reason: "test-only '); DROP TABLE users; --" }, ipAddress: ' 2001:db8::1 ' }, { connection: db, strict: true });
  assert.deepEqual(result, { id: '9007199254740993' });
  assert.match(calls[0].sql, /INSERT INTO audit_logs\s+\(actor_user_id, action, entity_type, entity_id, description, metadata, ip_address\)/);
  assert.equal((calls[0].sql.match(/\?/g) || []).length, 7);
  assert.ok(!calls[0].sql.includes('DROP TABLE'));
  assert.ok(!calls[0].sql.includes('created_at'));
  assert.deepEqual(calls[0].values, [null, 'LOGIN_FAILED', 'AUTH', null, null,
    JSON.stringify({ reason: "test-only '); DROP TABLE users; --" }), '2001:db8::1']);
  assert.deepEqual(Object.keys(repository).sort(), ['countAll', 'create', 'findAll']);
});

test('recursive sanitizer removes secret keys and unsafe containers without mutating callers', async () => {
  const metadata = {
    previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN', reason: 'Support workload',
    PASSWORD: 'test-only-sensitive-value', password_hash: 'test-only-sensitive-value',
    nested: { refresh_token: 'test-only-sensitive-value', 'Set-Cookie': 'test-only-sensitive-value',
      headers: { Authorization: 'test-only-sensitive-value' }, config: { innocent: 'test-only-sensitive-value' },
      apiSecret: 'test-only-sensitive-value', SMTP_PASS: 'test-only-sensitive-value', DB_PASSWORD: 'test-only-sensitive-value',
      currentPassword: 'test-only-sensitive-value', newPassword: 'test-only-sensitive-value', accessToken: 'test-only-sensitive-value',
      api_key: 'test-only-sensitive-value', privateKey: 'test-only-sensitive-value',
      items: [{ Cookie: 'test-only-sensitive-value', field: 'assigned_to' }, 'plain <text>'] },
  };
  const before = JSON.stringify(metadata);
  let stored;
  const db = { execute: async (sql, params) => { stored = JSON.parse(params[5]); return [{ insertId: 1 }]; } };
  await service.log({ action: AUDIT_ACTIONS.USER_ROLE_CHANGED, actorUserId: 1, entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: 2n, metadata }, { connection: db, strict: true });
  assert.equal(JSON.stringify(metadata), before);
  assert.ok(!JSON.stringify(stored).includes('test-only-sensitive-value'));
  assert.deepEqual(stored, { previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN', reason: 'Support workload',
    nested: { items: [{ field: 'assigned_to' }, 'plain <text>'] } });
  assert.notEqual(stored.nested, metadata.nested);
});

test('writer rejects invalid/unknown fields, actions, entities, IDs, IPs and caller timestamps', async t => {
  t.mock.method(console, 'error', () => {});
  let calls = 0;
  const db = { execute: async () => { calls++; return [{ insertId: 1 }]; } };
  const invalid = [
    { action: 'user.created' }, { action: 'UNKNOWN_ACTION' }, { entityType: 'UNKNOWN_ENTITY' },
    ...[0, -1, 'SYSTEM', '01', '1 OR 1=1', '18446744073709551616', Number.MAX_SAFE_INTEGER + 1].map(actorUserId => ({ actorUserId })),
    { entityId: 0 }, { entityType: null, entityId: 1 }, { ipAddress: '127.0.0.1, 10.0.0.1' },
    { ipAddress: 'fe80::1%eth0' }, { description: 'x'.repeat(1001) }, { createdAt: '2000-01-01' },
    { outcome: 'FAILURE' }, { userAgent: 'test-agent' }, { requestId: 'test-id' },
  ];
  for (const values of invalid) {
    await assert.rejects(service.log({ ...base, ...values }, { connection: db, strict: true }), { code: 'AUDIT_INVALID_ENTRY', message: 'Invalid audit entry' });
  }
  assert.equal(calls, 0);
});

test('writer preserves maximum unsigned BIGINT identity and valid IPv4', async () => {
  const db = { execute: async (sql, params) => {
    assert.equal(params[0], '18446744073709551615'); assert.equal(params[3], '9007199254740993');
    assert.equal(params[6], '127.0.0.1'); return [{ insertId: 5 }];
  } };
  assert.deepEqual(await service.log({ action: AUDIT_ACTIONS.USER_CREATED, entityType: AUDIT_ENTITY_TYPES.USER,
    actorUserId: '18446744073709551615', entityId: 9007199254740993n, ipAddress: '127.0.0.1' }, { connection: db, strict: true }), { id: '5' });
});

test('metadata rejects oversized, circular, deep, non-JSON and request objects safely', async t => {
  t.mock.method(console, 'error', () => {});
  const circular = {}; circular.self = circular;
  let deep = {}; for (let i = 0; i < 10; i++) deep = { nested: deep };
  const getter = { get reason() { throw new Error('test-only getter must not execute'); } };
  const bad = [{ reason: 'x'.repeat(MAX_METADATA_BYTES) }, { reason: '\u0000'.repeat(4000) }, circular, deep,
    { values: Array(1025).fill(null) }, { value: Infinity }, { value: 1n }, { value: undefined },
    { value: new Date() }, { value: () => {} }, { toJSON() { return {}; } }, getter,
    { originalUrl: '/test', headers: {}, body: {} }, { method: 'POST', url: '/test', headers: {}, body: {} },
    { id: 1, email: 'fake@example.test', password_hash: 'test-only-secret' },
    { id: 1, created_at: 'test-only-date', updated_at: 'test-only-date' }, { dataValues: { id: 1 } },
    new (class Request {})(), 'serialized JSON', []];
  const db = { execute: async () => { assert.fail('Invalid metadata must not reach DB'); } };
  for (const metadata of bad) {
    assert.equal(await service.log({ ...base, metadata }, { connection: db }), null);
  }
  assert.deepEqual(sanitizeMetadata({ reason: 'x'.repeat(MAX_METADATA_BYTES - 13) }), { reason: 'x'.repeat(MAX_METADATA_BYTES - 13) });
});

test('sanitizer prevents prototype pollution, never invokes secret getters, and permits shared values', () => {
  const metadata = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"reason":"safe"}');
  Object.defineProperty(metadata, 'password', { enumerable: true, get() { assert.fail('Secret getter executed'); } });
  assert.deepEqual(sanitizeMetadata(metadata), { reason: 'safe' });
  assert.equal({}.polluted, undefined);
  const shared = { reason: 'safe' };
  assert.deepEqual(sanitizeMetadata({ first: shared, second: shared }), { first: shared, second: shared });
  assert.equal(sanitizeMetadata({ token: 'test-only-sensitive' }), null);
});

test('default and strict failures log only safe categories and never leak DB errors', async t => {
  const messages = [];
  t.mock.method(console, 'error', (...args) => messages.push(args.join(' ')));
  const db = { execute: async () => { throw Object.assign(new Error('test-only-sensitive SQL password'), { sql: 'test-only-sensitive', parameters: ['test-only-sensitive'] }); } };
  assert.equal(await service.log(base, { connection: db }), null);
  await assert.rejects(service.log(base, { connection: db, strict: true }), error => {
    assert.equal(error.code, 'AUDIT_WRITE_FAILED'); assert.equal(error.message, 'Audit write failed');
    assert.equal(error.cause, undefined); assert.equal(error.sql, undefined); return true;
  });
  assert.equal(await service.log({ ...base, action: 'test-only-sensitive' }, { connection: db }), null);
  assert.ok(!messages.join(' ').includes('test-only-sensitive'));
  assert.deepEqual(messages, ['Audit log write failed: database operation', 'Audit log write failed: database operation', 'Audit log write failed: invalid entry']);
});

test('legacy read metadata remains null-safe and preserves the current allowlisted API contract', () => {
  for (const value of ['', '{broken', null, 'null', '[]', { value: Infinity }]) assert.equal(service.safeMetadata(value), null);
  assert.deepEqual(service.safeMetadata('{"isDemo":true,"schemaVersion":1,"password":"test-only-secret","previousRole":"EMPLOYEE"}'), { isDemo: true, schemaVersion: 1, previousRole: 'EMPLOYEE' });
});
