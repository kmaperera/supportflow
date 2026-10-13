// Cross-role regression on real HTTP/MySQL with isolated outer transaction.
// Cloudinary upload/download bytes are stubbed; authorization/storage are real.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const pool = require('../src/config/database');
let connection, server, io, stage = 'setup';
const clients = [];
const saved = { query: pool.query, execute: pool.execute, getConnection: pool.getConnection };
async function main() {
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error();
  process.env.NODE_ENV = 'test';
  connection = await pool.getConnection(); await connection.beginTransaction();
  await connection.query("SET SESSION time_zone='+00:00'");
  let sequence = 0; const savepoints = [];
  const db = {
    query: (...args) => connection.query(...args), execute: (...args) => connection.execute(...args),
    async beginTransaction() { const name = `workflow_${++sequence}`; await connection.query(`SAVEPOINT ${name}`); savepoints.push(name); },
    async commit() { await connection.query(`RELEASE SAVEPOINT ${savepoints.pop()}`); },
    async rollback() { if (savepoints.length) { const name = savepoints.pop(); await connection.query(`ROLLBACK TO SAVEPOINT ${name}`); await connection.query(`RELEASE SAVEPOINT ${name}`); } },
    release() {}, destroy() { throw new Error(); },
  };
  pool.query = db.query; pool.execute = db.execute; pool.getConnection = async () => db;
  const run = randomUUID().replaceAll('-', ''); const password = `Fixture-${randomUUID()}!`;
  const hash = await require('../src/utils/password').hashPassword(password); const actors = [];
  for (const role of ['EMPLOYEE', 'EMPLOYEE', 'TECHNICIAN', 'TECHNICIAN', 'ADMIN']) {
    const email = `workflow-${run}-${actors.length}@example.test`;
    const [row] = await connection.execute(`INSERT INTO users (first_name,last_name,email,password_hash,role,is_active,must_change_password)
      VALUES ('Workflow','Fixture',?,?,?,TRUE,FALSE)`, [email, hash, role]);
    actors.push({ id: String(row.insertId), email, role });
  }
  const [employee, otherEmployee, technician, otherTechnician, admin] = actors;
  const assets = new Map();
  require('../src/services/cloudinaryUpload.service').uploadAttachmentBuffer = async ({ buffer, mimeType }) => {
    const publicId = `fixture/${randomUUID()}`; assets.set(publicId, buffer);
    return { publicId, secureUrl: 'https://example.invalid/fixture', resourceType: mimeType.startsWith('image/') ? 'image' : 'raw', deliveryType: 'authenticated', bytes: buffer.length };
  };
  require('../src/services/attachmentDownload.service').fetchAttachment = async attachment => {
    assert.ok(assets.has(attachment.publicId)); return assets.get(attachment.publicId);
  };
  server = require('node:http').createServer(require('../src/app'));
  io = require('../src/config/socket').initializeSocket(server);
  io.on('connection', socket => socket.on('fixture:barrier', acknowledge => acknowledge()));
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; let checks = 0;
  async function request(actor, method, path, body, expected = 200, binary = false) {
    stage = `${method} ${path.split('?')[0]}`;
    const headers = { Origin: 'http://localhost:5173', ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}) };
    if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + '/api/v1' + path, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), redirect: 'manual' });
    if (response.status !== expected) stage += ` expected ${expected}, received ${response.status}`;
    assert.equal(response.status, expected); checks++;
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('x-powered-by'), null);
    if (binary) { assert.ok((await response.arrayBuffer()).byteLength); return response; }
    const result = await response.json();
    if (expected >= 400) { assert.equal(result.success, false); assert.ok(Array.isArray(result.errors)); assert.ok(!JSON.stringify(result).includes('stack')); }
    return result;
  }
  for (const actor of actors) {
    const result = await request(null, 'POST', '/auth/login', { email: actor.email, password });
    actor.token = result.data.accessToken;
  }
  const connect = require('socket.io-client').io;
  for (const actor of [employee, otherEmployee]) {
    const client = connect(origin, { transports: ['websocket'], reconnection: false, auth: { token: actor.token }, extraHeaders: { Origin: 'http://localhost:5173' } });
    clients.push(client); await require('node:events').once(client, 'connect', { signal: AbortSignal.timeout(5000) });
  }
  const realtime = require('node:events').once(clients[0], 'notification:new', { signal: AbortSignal.timeout(5000) });
  let otherReceived = 0; clients[1].on('notification:new', () => { otherReceived++; });
  for (const actor of [employee, technician, admin]) {
    await request(actor, 'GET', `/dashboard/${actor.role.toLowerCase()}/summary`);
    await request(actor, 'GET', '/auth/me'); await request(actor, 'GET', '/notifications');
  }
  const category = (await request(admin, 'POST', '/tickets/admin/categories', { name: `Workflow ${run}` }, 201)).data.category;
  const [priorities] = await connection.query('SELECT p.id FROM ticket_priorities p JOIN sla_policies s ON s.priority_id=p.id WHERE p.is_active=TRUE AND s.is_active=TRUE ORDER BY p.id LIMIT 2');
  assert.ok(priorities.length);
  const ticket = (await request(employee, 'POST', '/tickets', { categoryId: String(category.id), priorityId: String(priorities[0].id), title: 'Workflow fixture ticket', description: 'Harmless cross-role regression description' }, 201)).data.ticket;
  stage = 'ticket creation SLA/realtime checks';
  assert.ok(ticket.responseDueAt && ticket.resolutionDueAt);
  const [notice] = await realtime; assert.equal(String(notice.ticketId), String(ticket.id));
  const [recipient] = await connection.execute('SELECT user_id FROM notifications WHERE id=?', [notice.id]);
  assert.equal(String(recipient[0].user_id), employee.id);
  await clients[1].timeout(2000).emitWithAck('fixture:barrier'); assert.equal(otherReceived, 0);
  assert.deepEqual([...io.sockets.sockets.get(clients[1].id).rooms].sort(), [clients[1].id, `user:${otherEmployee.id}`].sort());
  const id = ticket.id;
  await request(employee, 'GET', '/tickets/my'); await request(employee, 'GET', `/tickets/${id}`);
  await request(otherEmployee, 'GET', `/tickets/${id}`, undefined, 404);
  await request(employee, 'PATCH', `/tickets/${id}`, { title: 'Updated fixture title' });
  await request(employee, 'PATCH', `/tickets/${id}`, { role: 'ADMIN', requesterId: otherEmployee.id }, 422);
  const comment = (await request(employee, 'POST', `/tickets/${id}/comments`, { content: '<script>alert(1)</script> harmless comment' }, 201)).data.comment;
  await request(employee, 'POST', `/tickets/${id}/internal-notes`, { content: 'not permitted' }, 403);
  await request(technician, 'GET', '/tickets/queue'); await request(technician, 'POST', `/tickets/${id}/self-assign`, {});
  await request(technician, 'GET', '/tickets/assigned-to-me'); await request(technician, 'GET', `/tickets/${id}`);
  await request(technician, 'PATCH', `/tickets/${id}/status`, { status: 'IN_PROGRESS' });
  await request(otherTechnician, 'PATCH', `/tickets/${id}/status`, { status: 'WAITING_FOR_USER' }, 404);
  if (priorities[1]) await request(technician, 'PATCH', `/tickets/${id}/priority`, { priorityId: String(priorities[1].id) });
  await request(technician, 'POST', `/tickets/${id}/internal-notes`, { content: '<img src=x onerror=alert(1)> harmless internal note' }, 201);
  const visible = await request(employee, 'GET', `/tickets/${id}/comments`);
  assert.ok(visible.data.comments.every(row => row.commentType !== 'INTERNAL'));
  const payload = Buffer.from('Harmless download bytes');
  const multipart = new FormData(); multipart.append('attachment', new Blob([payload], { type: 'text/plain' }), '<img src=x onerror=alert(1)>.txt');
  const attachment = (await request(employee, 'POST', `/tickets/${id}/attachments`, multipart, 201)).data.attachment;
  assert.ok(!JSON.stringify(attachment).includes('example.invalid')); await request(employee, 'GET', `/tickets/${id}/attachments`);
  const downloaded = await request(employee, 'GET', `/tickets/${id}/attachments/${attachment.id}/download`, undefined, 200, true);
  assert.match(downloaded.headers.get('content-disposition'), /^attachment;/);
  await request(otherEmployee, 'GET', `/tickets/${id}/attachments/${attachment.id}/download`, undefined, 404);
  await request(admin, 'GET', '/users'); await request(admin, 'GET', '/users/assignable-technicians');
  await request(admin, 'GET', '/users/technician-workload'); await request(admin, 'GET', '/tickets/queue');
  await request(admin, 'PATCH', `/tickets/${id}/assign`, { technicianId: otherTechnician.id });
  await request(admin, 'PATCH', `/tickets/${id}/assign`, { technicianId: technician.id });
  const [assignment] = await connection.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL', [id]);
  await request(admin, 'PATCH', `/tickets/${id}/unassign`, { expectedAssignmentId: '18446744073709551615' }, 409);
  await request(admin, 'PATCH', `/tickets/${id}/unassign`, { expectedAssignmentId: String(assignment[0].id) });
  await request(admin, 'PATCH', `/tickets/${id}/assign`, { technicianId: technician.id });
  await request(technician, 'PATCH', `/tickets/${id}/status`, { status: 'IN_PROGRESS' });
  await request(technician, 'PATCH', `/tickets/${id}/resolve`, { resolutionSummary: 'Harmless fixture issue resolved successfully.' });
  await request(employee, 'PATCH', `/tickets/${id}/reopen`, {});
  await request(technician, 'PATCH', `/tickets/${id}/status`, { status: 'IN_PROGRESS' });
  await request(technician, 'PATCH', `/tickets/${id}/resolve`, { resolutionSummary: 'Harmless fixture issue resolved again successfully.' });
  await request(employee, 'PATCH', `/tickets/${id}/close`, {});
  await request(employee, 'PUT', `/tickets/${id}/feedback`, { rating: 5, comment: 'Fixture feedback' });
  await request(employee, 'PATCH', `/tickets/${id}/reopen`, {}, 409);
  const kbCategory = (await request(admin, 'POST', '/knowledge-base/categories', { name: `Workflow KB ${run}` }, 201)).data.category;
  const article = (await request(admin, 'POST', '/knowledge-base/articles', { categoryId: Number(kbCategory.id), title: 'Workflow fixture knowledge article', content: '<script>alert(1)</script> plain fixture content' }, 201)).data.article;
  await request(employee, 'GET', `/knowledge-base/articles/${article.id}`, undefined, 404);
  await request(admin, 'PATCH', `/knowledge-base/articles/${article.id}/publish`, {});
  await request(employee, 'GET', '/knowledge-base/articles'); await request(employee, 'GET', `/knowledge-base/articles/${article.id}`);
  await request(technician, 'GET', `/knowledge-base/articles/${article.id}`);
  await request(admin, 'PATCH', `/knowledge-base/articles/${article.id}/archive`, {});
  await request(employee, 'GET', `/knowledge-base/articles/${article.id}`, undefined, 404);
  for (const path of ['/dashboard/ticket-summary', '/dashboard/ticket-trend', '/dashboard/satisfaction-summary', '/reports/tickets', '/reports/sla', '/audit-logs']) await request(admin, 'GET', path);
  for (const path of ['/reports/tickets/export/csv', '/reports/tickets/export/pdf']) {
    const exportResult = await request(admin, 'GET', path, undefined, 200, true);
    assert.match(exportResult.headers.get('content-disposition'), /attachment/);
    assert.ok(exportResult.headers.get('access-control-expose-headers').toLowerCase().includes('content-disposition'));
  }
  const [notification] = await connection.execute('SELECT id FROM notifications WHERE user_id=? ORDER BY id LIMIT 1', [employee.id]);
  await request(admin, 'PATCH', `/notifications/${notification[0].id}/read`, {}, 404);
  await request(employee, 'PATCH', `/notifications/${notification[0].id}/read`, {});
  for (const actor of [employee, technician, admin]) { await request(actor, 'PATCH', '/notifications/read-all', {}); await request(actor, 'POST', '/auth/logout'); }
  assert.ok(comment.id);
  console.log(`PASS: ${checks} real HTTP/MySQL cross-role workflow checks, lifecycle/SLA, comments/internal-note privacy, attachment storage/download authorization (provider stub), KB, exports, audit, notification ownership and trusted-origin realtime.`);
}
main().catch(() => { console.error('Workflow regression failed at ' + stage + ' (details suppressed).'); process.exitCode = 1; }).finally(async () => {
  for (const client of clients) client.disconnect();
  if (io) await new Promise(resolve => io.close(resolve)); else if (server) await new Promise(resolve => server.close(resolve));
  pool.query = saved.query; pool.execute = saved.execute; pool.getConnection = saved.getConnection;
  if (connection) { try { await connection.rollback(); console.log('All workflow fixtures, sessions, notifications and audit rows rolled back.'); } finally { connection.release(); } }
  await pool.end();
});
