// Explicit local-only HTTP + MySQL integration. All fixture rows and events are
// rolled back. Savepoints isolate service transactions inside the outer test TX.
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
  connection = await pool.getConnection();
  await connection.beginTransaction();
  let sequence = 0;
  const savepoints = [];
  const db = {
    query: (...args) => connection.query(...args), execute: (...args) => connection.execute(...args),
    async beginTransaction() { const name = `audit_test_${++sequence}`; await connection.query(`SAVEPOINT ${name}`); savepoints.push(name); },
    async commit() { await connection.query(`RELEASE SAVEPOINT ${savepoints.pop()}`); },
    async rollback() { if (savepoints.length) { const name = savepoints.pop(); await connection.query(`ROLLBACK TO SAVEPOINT ${name}`); await connection.query(`RELEASE SAVEPOINT ${name}`); } },
    release() {}, destroy() { throw new Error('Test connection must remain open'); },
  };
  // Redirect real repository SQL to the isolated connection, without replacing
  // business services, audit writer, SQL operations or HTTP authorization.
  pool.query = db.query; pool.execute = db.execute; pool.getConnection = async () => db;
  const run = randomUUID().replaceAll('-', '');
  const password = `Fixture-${randomUUID()}!`;
  const hash = await hashPassword(password);
  const [actor] = await connection.execute(`INSERT INTO users
    (first_name, last_name, email, password_hash, role, is_active, must_change_password)
    VALUES ('Audit', 'Fixture', ?, ?, 'ADMIN', TRUE, FALSE)`, [`audit-${run}@example.test`, hash]);
  const actorId = String(actor.insertId);
  const { generateAccessToken } = require('../src/utils/jwt');
  const adminToken = generateAccessToken({ id: actorId, role: 'ADMIN' });
  const app = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function request(method, path, body, expected = 200, token = adminToken) {
    const response = await fetch(url + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, expected, 'Unexpected integration response status');
    return (await response.json()).data;
  }
  async function eventCount() {
    const [rows] = await connection.execute('SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id = ?', [actorId]);
    return Number(rows[0].total);
  }
  const user = (await request('POST', '/users', { firstName: 'Audit', lastName: 'Target', email: `target-${run}@example.test`, role: 'EMPLOYEE', password }, 201)).user;
  const targetId = String(user.id);
  await request('PATCH', `/users/${targetId}/role`, { role: 'TECHNICIAN' });
  const afterRole = await eventCount();
  await request('PATCH', `/users/${targetId}/role`, { role: 'TECHNICIAN' });
  assert.equal(await eventCount(), afterRole);
  await request('PATCH', `/users/${targetId}/status`, { isActive: false });
  await request('PATCH', `/users/${targetId}/status`, { isActive: true });
  const afterStatus = await eventCount();
  await request('PATCH', `/users/${targetId}/status`, { isActive: true });
  assert.equal(await eventCount(), afterStatus);
  const tech = (await request('POST', '/users', { firstName: 'Audit', lastName: 'Technician', email: `tech-${run}@example.test`, role: 'TECHNICIAN', password }, 201)).user;
  const techId = String(tech.id);
  const ticketCategory = (await request('POST', '/tickets/admin/categories', { name: `Audit test ${run}` }, 201)).category;
  await request('PATCH', `/tickets/admin/categories/${ticketCategory.id}`, { description: 'Safe fixture category description' });
  await request('PATCH', `/tickets/admin/categories/${ticketCategory.id}/status`, { isActive: false });
  await request('PATCH', `/tickets/admin/categories/${ticketCategory.id}/status`, { isActive: true });
  const [priorities] = await connection.query('SELECT p.id FROM ticket_priorities p JOIN sla_policies s ON s.priority_id=p.id WHERE p.is_active=TRUE AND s.is_active=TRUE ORDER BY p.id LIMIT 2');
  assert.ok(priorities.length);
  const [ticketResult] = await connection.execute(`INSERT INTO tickets
    (ticket_number, created_by, category_id, priority_id, title, description, status)
    VALUES (?, ?, ?, ?, 'Audit fixture ticket', 'Safe disposable test description', 'OPEN')`,
  [`AUDIT-${run.slice(0, 20)}`, targetId, ticketCategory.id, priorities[0].id]);
  const ticketId = String(ticketResult.insertId);
  await request('PATCH', `/tickets/${ticketId}/assign`, { technicianId: targetId });
  const assignedCount = await eventCount();
  const [beforeReassign] = await connection.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL', [ticketId]);
  await request('PATCH', `/tickets/${ticketId}/assign`, { technicianId: targetId, expectedAssignmentId: beforeReassign[0].id });
  assert.equal(await eventCount(), assignedCount);
  await request('PATCH', `/tickets/${ticketId}/assign`, { technicianId: techId, expectedAssignmentId: beforeReassign[0].id });
  const [active] = await connection.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL', [ticketId]);
  const beforeStale = await eventCount();
  await request('PATCH', `/tickets/${ticketId}/unassign`, { expectedAssignmentId: '18446744073709551615' }, 409);
  assert.equal(await eventCount(), beforeStale);
  await request('PATCH', `/tickets/${ticketId}/unassign`, { expectedAssignmentId: String(active[0].id) });
  if (priorities[1]) await request('PATCH', `/tickets/${ticketId}/priority`, { priorityId: String(priorities[1].id) });
  const [policies] = await connection.query('SELECT id, response_time_minutes, resolution_time_minutes FROM sla_policies ORDER BY id LIMIT 1');
  const policy = policies[0]; assert.ok(policy);
  const responseMinutes = Number(policy.response_time_minutes) === 1 ? 2 : 1;
  await request('PATCH', `/sla/policies/${policy.id}`, { responseTimeMinutes: responseMinutes, resolutionTimeMinutes: Math.max(responseMinutes, Number(policy.resolution_time_minutes)) });
  const kbCategory = (await request('POST', '/knowledge-base/categories', { name: `Audit KB ${run}` }, 201)).category;
  await request('PATCH', `/knowledge-base/categories/${kbCategory.id}`, { description: 'Safe fixture description' });
  await request('PATCH', `/knowledge-base/categories/${kbCategory.id}/status`, { isActive: false });
  await request('PATCH', `/knowledge-base/categories/${kbCategory.id}/status`, { isActive: true });
  const article = (await request('POST', '/knowledge-base/articles', { categoryId: Number(kbCategory.id), title: `Audit article ${run}`, content: 'Test-only private body; must not appear in audit metadata.' }, 201)).article;
  await request('PATCH', `/knowledge-base/articles/${article.id}`, { content: 'Updated test-only private body; must not appear in audit metadata.' });
  await request('PATCH', `/knowledge-base/articles/${article.id}/publish`, {});
  const publishedCount = await eventCount();
  await request('PATCH', `/knowledge-base/articles/${article.id}/publish`, {});
  assert.equal(await eventCount(), publishedCount);
  await request('PATCH', `/knowledge-base/articles/${article.id}/unpublish`, {});
  await request('PATCH', `/knowledge-base/articles/${article.id}/archive`, {});
  // Fixture-only clear of mandatory-password-change state avoids invoking the
  // deferred password-change instrumentation. Real authorization is still used.
  await connection.execute('UPDATE users SET must_change_password=FALSE WHERE id IN (?, ?)', [targetId, techId]);
  const technicianToken = generateAccessToken({ id: techId, role: 'TECHNICIAN' });
  const beforeDenied = await eventCount();
  await request('PATCH', `/users/${targetId}/role`, { role: 'EMPLOYEE' }, 403, technicianToken);
  await request('PATCH', `/tickets/${ticketId}/assign`, { technicianId: techId }, 403, technicianToken);
  assert.equal(await eventCount(), beforeDenied);
  await request('PATCH', `/users/${targetId}/role`, { role: 'EMPLOYEE' });
  const employeeToken = generateAccessToken({ id: targetId, role: 'EMPLOYEE' });
  const beforeEmployeeDenied = await eventCount();
  await request('PATCH', `/users/${techId}/role`, { role: 'ADMIN' }, 403, employeeToken);
  await request('PATCH', `/tickets/${ticketId}/assign`, { technicianId: techId }, 403, employeeToken);
  assert.equal(await eventCount(), beforeEmployeeDenied);
  const [rows] = await connection.execute('SELECT CAST(actor_user_id AS CHAR) AS actor_user_id, action, CAST(entity_id AS CHAR) AS entity_id, metadata FROM audit_logs WHERE actor_user_id=? ORDER BY id', [actorId]);
  assert.ok(rows.every(row => row.actor_user_id === actorId));
  const roleEvent = rows.find(row => row.action === 'USER_ROLE_CHANGED');
  assert.equal(roleEvent.entity_id, targetId);
  const metadata = typeof roleEvent.metadata === 'string' ? JSON.parse(roleEvent.metadata) : roleEvent.metadata;
  assert.deepEqual(metadata, { previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN' });
  assert.ok(!JSON.stringify(rows).includes(password));
  assert.ok(!JSON.stringify(rows).includes('private body'));
  assert.ok(!rows.some(row => /^(LOGIN|LOGOUT|PASSWORD|REFRESH)/.test(row.action)));
  const page = await request('GET', `/audit-logs?actorUserId=${actorId}&limit=1`);
  assert.equal(page.logs.length, 1); assert.equal(page.pagination.total, rows.length);
  const filtered = await request('GET', `/audit-logs?actorUserId=${actorId}&action=USER_ROLE_CHANGED&entityType=USER&entityId=${targetId}`);
  assert.equal(filtered.logs.length, 2);
  assert.deepEqual(filtered.logs[1].metadata, metadata);
  console.log(`PASS: ${rows.length} real admin audit rows verified through local HTTP/MySQL, exact actors/targets, safe metadata, no-ops, stale 409, denied roles and viewer filters/pagination.`);
  console.log('Actions verified: ' + [...new Set(rows.map(row => row.action))].join(', '));
}

main().catch(() => { console.error('Admin audit MySQL integration failed (details suppressed).'); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  pool.query = original.query; pool.execute = original.execute; pool.getConnection = original.getConnection;
  if (connection) { try { await connection.rollback(); console.log('All integration fixtures and audit rows rolled back.'); } finally { connection.release(); } }
  await pool.end();
});
