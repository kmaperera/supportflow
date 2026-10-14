// Phase 19.1: broad endpoint contracts, not exhaustive feature/role testing.
// Uses real Express/MySQL with an outer rollback and service savepoints.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/config/database');
const { loadInventory, matchRoute } = require('./helpers/endpointInventory');
const saved = { query: pool.query, execute: pool.execute, getConnection: pool.getConnection };
let connection, server, io, stage = 'setup', routes, coverage = new Map(), checks = 0;
let fixtureIds = [], runId;
const unexpected = [];
const originalError = console.error;
const originalWarn = console.warn;
console.error = (...args) => { unexpected.push(String(args[0])); };
console.warn = (...args) => { unexpected.push(String(args[0])); };
process.on('unhandledRejection', () => { unexpected.push('Unhandled rejection'); });

async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST));
  process.env.NODE_ENV = 'test';
  connection = await pool.getConnection(); await connection.beginTransaction();
  await connection.query("SET SESSION time_zone='+00:00'");
  let sequence = 0; const savepoints = [];
  const db = {
    query: (...args) => connection.query(...args), execute: (...args) => connection.execute(...args),
    async beginTransaction() { const name = `endpoint_${++sequence}`; await connection.query(`SAVEPOINT ${name}`); savepoints.push(name); },
    async commit() { await connection.query(`RELEASE SAVEPOINT ${savepoints.pop()}`); },
    async rollback() { if (savepoints.length) { const name = savepoints.pop(); await connection.query(`ROLLBACK TO SAVEPOINT ${name}`); await connection.query(`RELEASE SAVEPOINT ${name}`); } },
    release() {}, destroy() { throw new Error('Unexpected connection destruction'); },
  };
  pool.query = db.query; pool.execute = db.execute; pool.getConnection = async () => db;
  // Outbound providers are replaced only inside this isolated test process.
  require('../src/config/mailer').getMailerTransporter = () => ({ sendMail: async () => ({ messageId: 'fixture' }) });
  const assets = new Map();
  const provider = require('../src/services/cloudinaryUpload.service');
  provider.uploadAttachmentBuffer = async ({ buffer }) => {
    const publicId = `fixture/${randomUUID()}`; assets.set(publicId, buffer);
    return { publicId, secureUrl: 'https://example.invalid/fixture', resourceType: 'raw', deliveryType: 'authenticated', bytes: buffer.length };
  };
  provider.deleteCloudinaryAsset = async ({ publicId }) => { assert.ok(assets.delete(publicId)); return { result: 'ok' }; };
  require('../src/services/attachmentDownload.service').fetchAttachment = async attachment => {
    assert.ok(assets.has(attachment.publicId)); return assets.get(attachment.publicId);
  };
  const inventory = loadInventory(); routes = inventory.routes;
  server = require('node:http').createServer(inventory.app);
  io = require('../src/config/socket').initializeSocket(server);
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(actor, method, url, body, expected = 200, options = {}) {
    stage = method + ' ' + url.split('?')[0];
    const headers = { Origin: 'http://localhost:5173', ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}), ...(options.cookie ? { Cookie: options.cookie } : {}) };
    if (!(body instanceof FormData)) headers['Content-Type'] = options.contentType || 'application/json';
    const response = await fetch(origin + '/api/v1' + url, { method, headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : options.raw ? body : JSON.stringify(body), redirect: 'manual' });
    stage += ` expected ${expected}, received ${response.status}`;
    assert.equal(response.status, expected); checks++;
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    const route = matchRoute(routes, method, '/api/v1' + url);
    if (route) { const key = route.method + ' ' + route.path; const statuses = coverage.get(key) || new Set(); statuses.add(response.status); coverage.set(key, statuses); }
    const contentType = response.headers.get('content-type');
    if (options.binary) {
      assert.match(contentType, options.binary === 'csv' ? /text\/csv/ : options.binary === 'pdf' ? /application\/pdf/ : /text\/plain/);
      assert.match(response.headers.get('content-disposition'), /^attachment/);
      const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length);
      if (options.binary === 'pdf') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      return { response, bytes };
    }
    assert.match(contentType, /application\/json/);
    const result = await response.json(); assert.equal(result.success, expected < 400); assert.equal(typeof result.message, 'string');
    if (expected >= 400) { assert.ok(Array.isArray(result.errors)); assert.ok(!JSON.stringify(result).includes('stack')); }
    else if (['/auth/logout', '/auth/logout-all', '/auth/change-password'].includes(url)) assert.ok(result.data == null || typeof result.data === 'object');
    else assert.ok(Object.hasOwn(result, 'data') && (result.data === null || typeof result.data === 'object'));
    return { ...result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const run = randomUUID().replaceAll('-', ''); runId = run; const password = `Fixture-${randomUUID()}!`;
  const hash = await require('../src/utils/password').hashPassword(password);
  const actors = [];
  for (const role of ['EMPLOYEE', 'TECHNICIAN', 'ADMIN']) {
    const email = `endpoint-${run}-${role.toLowerCase()}@example.test`;
    const [row] = await connection.execute("INSERT INTO users (first_name,last_name,email,password_hash,role,is_active,must_change_password) VALUES ('Endpoint','Fixture',?,?,?,TRUE,FALSE)", [email, hash, role]);
    actors.push({ id: String(row.insertId), role, email });
    fixtureIds.push(String(row.insertId));
  }
  const [employee, technician, admin] = actors;
  assert.deepEqual((await request(null, 'GET', '/health')).data, { server: 'UP', database: 'UP' });
  const originalQuery = pool.query;
  pool.query = async (...args) => { if (args[0] === 'SELECT 1') throw new Error('Fixture DB outage'); return originalQuery(...args); };
  await request(null, 'GET', '/health', undefined, 500); pool.query = originalQuery;
  assert.deepEqual(unexpected.splice(0), ['Unexpected server error']);
  for (const actor of actors) {
    const login = await request(null, 'POST', '/auth/login', { email: actor.email, password });
    actor.token = login.data.accessToken; actor.cookie = login.cookie;
  }
  await request(employee, 'GET', '/auth/me');
  const refreshed = await request(null, 'POST', '/auth/refresh', {}, 200, { cookie: employee.cookie });
  employee.token = refreshed.data.accessToken; employee.cookie = refreshed.cookie;
  await request(null, 'POST', '/auth/logout', {}, 200, { cookie: employee.cookie });
  const secondLogin = await request(null, 'POST', '/auth/login', { email: employee.email, password });
  employee.token = secondLogin.data.accessToken;
  await request(null, 'POST', '/auth/logout-all', {}, 200, { cookie: secondLogin.cookie });
  await request(employee, 'PATCH', '/auth/change-password', { currentPassword: password, newPassword: 'EndpointUpdated123!', confirmPassword: 'EndpointUpdated123!' });

  const newUser = (await request(admin, 'POST', '/users', { firstName: 'Endpoint', lastName: 'Created', email: `created-${run}@example.test`, password, role: 'EMPLOYEE' }, 201)).data.user;
  await request(admin, 'GET', '/users');
  const userList = await request(admin, 'GET', `/users?search=Endpoint&role=EMPLOYEE&isActive=true&sortBy=first_name&order=ASC&page=1&limit=10`);
  assert.ok(userList.data.users.length); assert.equal(typeof userList.pagination.totalRecords, 'number');
  await request(admin, 'GET', `/users/${newUser.id}`);
  const updatedUser = (await request(admin, 'PATCH', `/users/${newUser.id}`, { department: 'Endpoint fixture', phone: null })).data.user;
  assert.equal(updatedUser.phone, null); assert.equal(typeof updatedUser.isActive, 'boolean');
  await request(admin, 'PATCH', `/users/${newUser.id}/role`, { role: 'TECHNICIAN' });
  await request(admin, 'PATCH', `/users/${newUser.id}/status`, { isActive: false });
  await request(admin, 'GET', '/users/assignable-technicians'); await request(admin, 'GET', '/users/technician-workload');
  const emptyUsers = await request(admin, 'GET', '/users?search=' + run + '-no-match'); assert.deepEqual(emptyUsers.data.users, []);

  const category = (await request(admin, 'POST', '/tickets/admin/categories', { name: 'Endpoint ' + run }, 201)).data.category;
  await request(admin, 'GET', '/tickets/admin/categories'); await request(admin, 'GET', `/tickets/admin/categories/${category.id}`);
  await request(admin, 'PATCH', `/tickets/admin/categories/${category.id}`, { description: 'Endpoint smoke fixture' });
  await request(admin, 'PATCH', `/tickets/admin/categories/${category.id}/status`, { isActive: true });
  await request(employee, 'GET', '/tickets/categories'); const priorities = (await request(employee, 'GET', '/tickets/priorities')).data.priorities;
  assert.ok(priorities.length);
  const policies = (await request(admin, 'GET', '/sla/policies')).data.policies;
  const policy = policies.find(row => priorities.some(p => String(p.id) === String(row.priorityId)) && row.isActive);
  assert.ok(policy, 'Active seeded priority/SLA fixture required');
  await request(admin, 'PATCH', `/sla/policies/${policy.id}`, { responseTimeMinutes: policy.responseTimeMinutes + 1, resolutionTimeMinutes: Math.max(policy.resolutionTimeMinutes, policy.responseTimeMinutes + 1) });
  const ticket = (await request(employee, 'POST', '/tickets', { categoryId: String(category.id), priorityId: String(policy.priorityId), title: 'Endpoint fixture ' + run, description: 'Harmless endpoint regression ticket description.' }, 201)).data.ticket;
  const id = ticket.id;
  assert.ok(Number.isFinite(Date.parse(ticket.createdAt))); assert.ok(ticket.responseDueAt && ticket.resolutionDueAt);
  const detail = (await request(employee, 'GET', `/tickets/${id}`)).data.ticket;
  assert.equal(detail.resolvedAt, null);
  await request(employee, 'GET', '/tickets/my');
  const filtered = await request(employee, 'GET', `/tickets/my?status=OPEN&priorityId=${policy.priorityId}&categoryId=${category.id}&search=Endpoint%20fixture&sortBy=created_at&order=asc&page=1&limit=5&fromDate=2000-01-01&toDate=2099-12-31`);
  assert.ok(filtered.data.tickets.some(row => String(row.id) === String(id))); assert.equal(typeof filtered.pagination.totalRecords, 'number');
  await request(employee, 'GET', '/tickets/my?sortBy=created_at&order=desc');
  const noTickets = await request(employee, 'GET', '/tickets/my?search=' + run + '-no-match%20%26'); assert.deepEqual(noTickets.data.tickets, []);
  await request(employee, 'PATCH', `/tickets/${id}`, { title: 'Endpoint updated title' });
  const comment = (await request(employee, 'POST', `/tickets/${id}/comments`, { content: 'Harmless public fixture comment.' }, 201)).data.comment;
  await request(employee, 'GET', `/tickets/${id}/comments`);
  await request(technician, 'GET', '/tickets/queue'); await request(technician, 'POST', `/tickets/${id}/self-assign`, {});
  await request(technician, 'GET', '/tickets/assigned-to-me'); await request(admin, 'GET', '/tickets/workflow-summary');
  await request(admin, 'PATCH', `/tickets/${id}/assign`, { technicianId: technician.id });
  const [assignments] = await connection.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL', [id]);
  await request(admin, 'PATCH', `/tickets/${id}/unassign`, { expectedAssignmentId: '18446744073709551614' }, 409);
  await request(admin, 'PATCH', `/tickets/${id}/unassign`, { expectedAssignmentId: String(assignments[0].id) });
  await request(admin, 'PATCH', `/tickets/${id}/assign`, { technicianId: technician.id });
  await request(technician, 'PATCH', `/tickets/${id}/status`, { status: 'IN_PROGRESS' });
  await request(technician, 'PATCH', `/tickets/${id}/priority`, { priorityId: String(policy.priorityId) });
  await request(technician, 'POST', `/tickets/${id}/internal-notes`, { content: 'Harmless internal fixture note.' }, 201);
  await request(employee, 'GET', `/tickets/${id}/status-history`); await request(admin, 'GET', `/tickets/${id}/assignment-history`);
  const upload = async url => { const form = new FormData(); form.append('attachment', new Blob(['Endpoint fixture bytes'], { type: 'text/plain' }), 'fixture.txt'); return (await request(employee, 'POST', url, form, 201)).data.attachment; };
  const attachment = await upload(`/tickets/${id}/attachments`);
  await upload(`/tickets/${id}/comments/${comment.id}/attachments`);
  await request(employee, 'GET', `/tickets/${id}/attachments`);
  await request(employee, 'GET', `/tickets/${id}/attachments/${attachment.id}/download`, undefined, 200, { binary: 'text' });
  await request(employee, 'DELETE', `/tickets/${id}/attachments/${attachment.id}`);
  await request(technician, 'PATCH', `/tickets/${id}/resolve`, { resolutionSummary: 'Harmless endpoint fixture resolution.' });
  await request(employee, 'PATCH', `/tickets/${id}/reopen`, {});
  await request(technician, 'PATCH', `/tickets/${id}/status`, { status: 'IN_PROGRESS' });
  await request(technician, 'PATCH', `/tickets/${id}/resolve`, { resolutionSummary: 'Harmless final fixture resolution.' });
  await request(employee, 'PATCH', `/tickets/${id}/close`, {});
  await request(employee, 'PUT', `/tickets/${id}/feedback`, { rating: 4, comment: 'Endpoint smoke feedback' });
  const notices = await request(employee, 'GET', '/notifications');
  assert.ok(notices.data.notifications.length);
  await request(employee, 'PATCH', `/notifications/${notices.data.notifications[0].id}/read`, {});
  await request(employee, 'PATCH', '/notifications/read-all', {});

  const kbCategory = (await request(admin, 'POST', '/knowledge-base/categories', { name: 'Endpoint KB ' + run }, 201)).data.category;
  await request(admin, 'GET', '/knowledge-base/categories');
  await request(admin, 'PATCH', `/knowledge-base/categories/${kbCategory.id}`, { description: 'Fixture category' });
  await request(admin, 'PATCH', `/knowledge-base/categories/${kbCategory.id}/status`, { isActive: true });
  const article = (await request(admin, 'POST', '/knowledge-base/articles', { categoryId: Number(kbCategory.id), title: 'Endpoint knowledge fixture', content: 'Harmless fixture knowledge content.' }, 201)).data.article;
  await request(admin, 'PATCH', `/knowledge-base/articles/${article.id}`, { title: 'Updated endpoint knowledge fixture' });
  await request(admin, 'PATCH', `/knowledge-base/articles/${article.id}/publish`, {});
  await request(employee, 'GET', '/knowledge-base/articles'); await request(employee, 'GET', `/knowledge-base/articles/${article.id}`);
  await request(employee, 'POST', '/knowledge-base/articles/suggestions', { title: 'Endpoint knowledge fixture' });
  await request(employee, 'PUT', `/knowledge-base/articles/${article.id}/feedback`, { isHelpful: true });
  await request(employee, 'GET', `/knowledge-base/articles/${article.id}/feedback`);
  await request(admin, 'PATCH', `/knowledge-base/articles/${article.id}/unpublish`, {});
  await request(admin, 'PATCH', `/knowledge-base/articles/${article.id}/archive`, {});
  for (const actor of actors) await request(actor, 'GET', `/dashboard/${actor.role.toLowerCase()}/summary`);
  for (const route of routes.filter(row => row.path.startsWith('/api/v1/dashboard/') && !row.path.endsWith('/summary'))) await request(admin, 'GET', route.path.slice(7));
  const dateRange = '?startDate=2000-01-01&endDate=2099-12-31';
  for (const route of routes.filter(row => row.path.startsWith('/api/v1/reports/'))) {
    await request(admin, 'GET', route.path.slice(7) + dateRange, undefined, 200, route.path.endsWith('/csv') ? { binary: 'csv' } : route.path.endsWith('/pdf') ? { binary: 'pdf' } : {});
  }
  const logs = await request(admin, 'GET', '/audit-logs'); assert.ok(logs.data.logs.length);
  assert.ok(logs.data.logs.every(row => Number.isFinite(Date.parse(row.createdAt))));
  assert.equal(typeof logs.data.pagination.total, 'number');
  // One shallow invalid/missing-resource case per mutation/read module.
  const absent = '18446744073709551614';
  for (const table of ['users', 'tickets', 'ticket_categories', 'knowledge_base_articles', 'knowledge_base_categories', 'notifications', 'sla_policies']) {
    const [rows] = await connection.query(`SELECT id FROM ${table} WHERE id=?`, [absent]); assert.equal(rows.length, 0);
  }
  for (const url of [`/users/${absent}`, `/tickets/${absent}`, `/tickets/admin/categories/${absent}`, `/knowledge-base/articles/${absent}`]) await request(admin, 'GET', url, undefined, 404);
  await request(admin, 'PATCH', `/sla/policies/${absent}`, { responseTimeMinutes: 10, resolutionTimeMinutes: 20 }, 404);
  await request(employee, 'PATCH', `/notifications/${absent}/read`, {}, 404);
  await request(employee, 'GET', `/tickets/${id}/comments?page=invalid`, undefined, 422);
  await request(employee, 'GET', `/tickets/${id}/attachments?unsupported=true`, undefined, 422);
  await request(admin, 'GET', '/dashboard/ticket-trend?period=invalid', undefined, 422);
  await request(admin, 'GET', '/reports/tickets?startDate=invalid', undefined, 422);
  await request(admin, 'GET', '/audit-logs?limit=0', undefined, 400);
  await request(employee, 'PATCH', `/tickets/${id}/reopen`, {}, 409);
  await request(null, 'GET', '/auth/me', undefined, 401);
  await request(employee, 'GET', '/users', undefined, 403);
  await request(null, 'GET', '/this-route-does-not-exist', undefined, 404);
  await request(admin, 'DELETE', '/audit-logs', undefined, 404);
  await request(admin, 'PUT', `/users/${newUser.id}`, {}, 404);
  await request(null, 'POST', '/auth/login', '{', 400, { raw: true });
  await request(null, 'POST', '/auth/login', {}, 422);
  await request(null, 'POST', '/auth/login', 'plain text', 422, { raw: true, contentType: 'text/plain' });
  await request(null, 'POST', '/auth/login', { email: 'x'.repeat(11000) }, 413);
  assert.equal(savepoints.length, 0); assert.deepEqual(unexpected, []);
  const untested = routes.filter(route => ![...(coverage.get(route.method + ' ' + route.path) || [])].some(status => status < 400));
  assert.deepEqual(untested, [], 'Each inventoried endpoint needs a successful contract smoke');
  if (process.env.ENDPOINT_MATRIX === '1') {
    const rows = routes.map(route => `| ${route.file} | ${route.method} | \`${route.path}\` | ${route.auth} | ${route.roles} | ${route.controller} | PASS (${[...coverage.get(route.method + ' ' + route.path)].sort().join(', ')}) |`);
    fs.writeFileSync(path.join(__dirname, '../ENDPOINT_REGRESSION_MATRIX.md'), '# Phase 19.1 — actual mounted endpoint matrix\n\nGenerated by `ENDPOINT_MATRIX=1 node tests/endpoints.mysql.smoke.js` on 2026-10-14. PASS denotes an executed successful real HTTP/MySQL response contract; provider bytes/email are test doubles. Role columns describe route middleware, with additional ownership/state policy in services. Socket.IO `/socket.io` and the intentional root `/` liveness response are outside this API matrix.\n\n| Route file | Method | Full path | Authentication | Route roles | Controller | Result/statuses |\n| --- | --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n');
  }
  console.log(`PASS: ${routes.length} mounted endpoints; ${checks} HTTP contract checks; all endpoints have successful coverage; no unexpected console errors.`);
}
main().catch(() => { originalError('Endpoint regression failed at ' + stage + ' (details suppressed).'); process.exitCode = 1; }).finally(async () => {
  if (io) await new Promise(resolve => io.close(resolve)); else if (server) await new Promise(resolve => server.close(resolve));
  pool.query = saved.query; pool.execute = saved.execute; pool.getConnection = saved.getConnection;
  if (connection) { try {
    await connection.rollback();
    if (fixtureIds.length) for (const [table, column] of [['users', 'id'], ['tickets', 'created_by'], ['notifications', 'user_id'], ['refresh_tokens', 'user_id'], ['audit_logs', 'actor_user_id']]) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IN (${fixtureIds.map(() => '?').join(',')})`, fixtureIds);
      assert.equal(Number(rows[0].total), 0, 'Fixture rows remained after rollback');
    }
    if (runId) {
      const [rows] = await connection.query('SELECT COUNT(*) AS total FROM users WHERE email=?', [`created-${runId}@example.test`]);
      assert.equal(Number(rows[0].total), 0);
    }
    console.log('Rollback verified: no fixture users/tickets/sessions/notifications/audit rows retained.');
  } finally { connection.release(); } }
  console.error = originalError; console.warn = originalWarn; await pool.end();
});
