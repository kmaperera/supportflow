const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repository = require('../src/modules/users/user.repository');

test('user pagination emits only validated numeric literals and keeps filters bound', async t => {
  const calls = [];
  t.mock.method(pool, 'execute', async (sql, values) => { calls.push({ sql, values }); return [[]]; });
  for (const order of ['ASC', 'DESC']) {
    await repository.findAll({ limit: 20, offset: 0, sortBy: 'created_at', order });
    assert.match(calls.at(-1).sql, new RegExp(`ORDER BY created_at ${order}, id ${order} LIMIT 20 OFFSET 0$`));
    assert.deepEqual(calls.at(-1).values, []);
  }
  await repository.findAll({ limit: 1, offset: 1 });
  assert.match(calls.at(-1).sql, /LIMIT 1 OFFSET 1$/);
  const search = "' OR 1=1 --";
  for (const filter of [{ search }, { role: 'ADMIN' }, { isActive: false }, { search, role: 'EMPLOYEE', isActive: true }]) {
    await repository.findAll({ ...filter, limit: 20, offset: 0 });
    const { sql, values } = calls.at(-1);
    assert.ok(!sql.includes(search));
    assert.ok(!sql.includes('LIMIT ?'));
    if (filter.search) assert.deepEqual(values.slice(0, 3), Array(3).fill(`%${search}%`));
    if (filter.role) assert.ok(values.includes(filter.role));
    if (filter.isActive !== undefined) assert.ok(values.includes(filter.isActive));
  }
});

test('unsafe pagination and sorting are rejected before executing SQL', async t => {
  t.mock.method(pool, 'execute', async () => assert.fail('Invalid options reached SQL'));
  for (const options of [
    { limit: '20' }, { offset: '0' }, { limit: '1; DROP TABLE users' },
    { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: Infinity },
    { offset: -1 }, { offset: NaN }, { offset: Number.MAX_SAFE_INTEGER },
    { sortBy: 'created_at; DELETE FROM users' }, { order: 'DESC; DROP TABLE users' },
  ]) await assert.rejects(repository.findAll(options), TypeError);
});

test('HTTP-style pagination/filter strings are normalized by service without changing response shape', async t => {
  const calls = [];
  t.mock.method(pool, 'execute', async (sql, values) => {
    calls.push({ sql, values });
    return sql.includes('COUNT(*)') ? [[{ total: 2 }]] : [[{ id: 2, email: 'fixture@example.test', is_active: 1, must_change_password: 0 }]];
  });
  const service = require('../src/modules/users/user.service');
  for (const query of [
    { page: '1', limit: '20' }, { page: '2', limit: '1' },
    { search: 'fixture' }, { role: 'ADMIN' }, { isActive: 'false' },
    { sortBy: 'created_at', order: 'ASC' }, { sortBy: 'created_at', order: 'DESC' },
  ]) {
    const result = await service.getUsers(query);
    assert.equal(result.pagination.currentPage, Number(query.page ?? 1));
    assert.equal(result.pagination.totalRecords, 2);
    assert.equal(result.pagination.totalPages, query.limit === '1' ? 2 : 1);
    assert.equal(typeof result.pagination.hasNext, 'boolean');
    assert.equal(typeof result.pagination.hasPrevious, 'boolean');
    assert.equal(result.users[0].isActive, true);
    const list = calls.at(-2);
    assert.match(list.sql, /LIMIT \d+ OFFSET \d+$/);
    if (query.isActive) assert.deepEqual(list.values, [false]);
  }
});
