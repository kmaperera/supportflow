// Explicit local HTTP/MySQL verification. Fixture users, login sessions and
// legacy audit rows live in one outer transaction and are always rolled back.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const pool = require('../src/config/database');
let connection, server;
const original = { query: pool.query, execute: pool.execute, getConnection: pool.getConnection };

async function main() {
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error();
  process.env.NODE_ENV = 'test';
  connection = await pool.getConnection(); await connection.beginTransaction();
  await connection.query("SET SESSION time_zone = '+00:00'");
  const db = { query: (...args) => connection.query(...args), execute: (...args) => connection.execute(...args), release() {}, destroy() { throw new Error(); } };
  pool.query = db.query; pool.execute = db.execute; pool.getConnection = async () => db;
  const run = randomUUID().replaceAll('-', '');
  const password = `Fixture-${randomUUID()}!`;
  const hash = await require('../src/utils/password').hashPassword(password);
  const users = [];
  for (const role of ['ADMIN', 'EMPLOYEE', 'TECHNICIAN']) {
    const email = `retrieval-${run}-${users.length}@example.test`;
    const [result] = await connection.execute(`INSERT INTO users (first_name,last_name,email,password_hash,role,is_active,must_change_password)
      VALUES ('Retrieval','Fixture',?,?,?,TRUE,FALSE)`, [email, hash, role]);
    users.push({ id: String(result.insertId), email, role });
  }
  const fixtureIds = [];
  for (let i = 0; i < 8; i++) {
    const metadata = i === 7 ? { name: 'x'.repeat(20000) } : { previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN',
      password: 'test-only-sensitive', accessToken: 'test-only-sensitive', refreshToken: 'test-only-sensitive',
      authorization: 'test-only-sensitive', cookie: 'test-only-sensitive', apiSecret: 'test-only-sensitive' };
    const [result] = await connection.execute(`INSERT INTO audit_logs
      (actor_user_id,action,entity_type,entity_id,description,metadata,ip_address,created_at)
      VALUES (?, 'USER_ROLE_CHANGED', 'USER', ?, ?, ?, '2001:db8::1', '2026-10-14 12:00:00')`,
    [i === 6 ? null : users[0].id, users[1].id, `Fixture ${run} ${i}`, JSON.stringify(metadata)]);
    fixtureIds.push(String(result.insertId));
  }
  const app = require('../src/app'); server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const user of users) {
    const result = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    assert.equal(result.status, 200); user.token = (await result.json()).data.accessToken;
  }
  async function get(query = '', token = users[0].token, expected = 200) {
    const result = await fetch(base + '/audit-logs' + query, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(result.status, expected, 'Unexpected retrieval status');
    assert.match(result.headers.get('cache-control'), /no-store/);
    const body = await result.json();
    if (expected !== 200) { assert.equal(body.success, false); assert.ok(Array.isArray(body.errors)); assert.equal(body.data, undefined); }
    return body;
  }
  const [before] = await connection.query('SELECT COUNT(*) AS total FROM audit_logs');
  await get('?limit=invalid', null, 401);
  for (const user of users.slice(1)) await get('?limit=invalid', user.token, 403);
  for (const query of ['?limit=10000', '?actorUserId=-1', '?startDate=not-a-date', '?startDate=2026-10-15&endDate=2026-10-14',
    '?sort=password', '?order=ASC', '?action=NOT_REAL', '?entityType=NOT_REAL', '?includeRaw=true', '?outcome=FAILURE', '?page=1&page=2']) {
    const invalid = await get(query, users[0].token, 400);
    assert.deepEqual(invalid, { success: false, message: 'Invalid audit-log query', errors: [] });
  }
  const filter = `?entityType=USER&entityId=${users[1].id}&action=USER_ROLE_CHANGED&startDate=2026-10-14&endDate=2026-10-14`;
  const first = (await get(filter + '&page=1&limit=5')).data;
  const second = (await get(filter + '&page=2&limit=5')).data;
  assert.equal(first.pagination.total, 8); assert.equal(first.pagination.totalPages, 2);
  assert.equal(first.logs.length, 5); assert.equal(second.logs.length, 3);
  assert.deepEqual([...first.logs, ...second.logs].map(row => row.id), [...fixtureIds].reverse());
  assert.equal(first.logs[0].metadata, null); // Oversized legacy JSON suppressed by SQL.
  assert.equal(first.logs[1].actor, null); // NULL/missing actor does not hide a row.
  assert.deepEqual(first.logs[2].metadata, { previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN' });
  assert.ok(first.logs.every(row => row.createdAt === '2026-10-14T12:00:00.000Z'));
  const actorFiltered = (await get(filter + `&actorUserId=${users[0].id}`)).data;
  assert.equal(actorFiltered.pagination.total, 7); assert.ok(actorFiltered.logs.every(row => row.actor.id === users[0].id));
  const empty = (await get(filter + '&search=' + encodeURIComponent("' OR 1=1 --"))).data;
  assert.deepEqual(empty.logs, []); assert.equal(empty.pagination.total, 0);
  assert.equal((await get(filter + '&search=' + encodeURIComponent(run))).data.pagination.total, 8);
  assert.equal((await get(`?entityType=USER&entityId=${users[1].id}&endDate=2026-10-13`)).data.pagination.total, 0);
  const envelope = await get(); assert.equal(envelope.success, true); assert.ok(envelope.data.logs.length <= 25);
  assert.ok(!JSON.stringify([...first.logs, ...second.logs]).includes('test-only-sensitive'));
  assert.ok(!JSON.stringify([...first.logs, ...second.logs]).includes(hash));
  const [after] = await connection.query('SELECT COUNT(*) AS total FROM audit_logs');
  assert.equal(after[0].total, before[0].total, 'Retrieval must never audit itself');
  console.log('PASS: real Admin/Employee/Technician logins, 200/403/401/400, no-store, tied-timestamp pagination, actor/action/entity/date/search combinations, literal SQL-looking search, NULL actors and legacy-secret/size minimization.');
}
main().catch(() => { console.error('Audit retrieval integration failed (details suppressed).'); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  pool.query = original.query; pool.execute = original.execute; pool.getConnection = original.getConnection;
  if (connection) { try { await connection.rollback(); console.log('All retrieval fixtures and login sessions rolled back; existing history preserved.'); } finally { connection.release(); } }
  await pool.end();
});
