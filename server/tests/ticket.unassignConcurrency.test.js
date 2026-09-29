const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const tickets = require('../src/modules/tickets/ticket.repository');
const assignments = require('../src/modules/tickets/ticketAssignment.repository');
const history = require('../src/modules/tickets/ticketStatusHistory.repository');
const notifications = require('../src/modules/notifications/notification.service');
const realtime = require('../src/modules/notifications/notificationRealtime.service');
const service = require('../src/modules/tickets/ticket.service');
const admin = { id: 1, role: 'ADMIN' };

test('unassign compares assignment record after lock, rejects stale same-technician reassignment without writes', async t => {
  const events = [];
  const db = { async beginTransaction() { events.push('begin'); }, async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); } };
  t.mock.method(pool, 'getConnection', async () => db);
  let row = { id: 5, ticket_number: 'SUP-5', status: 'ASSIGNED', assigned_to: 7 };
  let active = { id: 11, technician_id: 7 };
  t.mock.method(tickets, 'lockById', async () => { events.push('lock'); return { id: 5 }; });
  t.mock.method(tickets, 'findById', async () => ({ ...row }));
  t.mock.method(assignments, 'findActiveAssignmentsByTicketId', async (id, connection) => {
    assert.equal(connection, db); assert.ok(events.includes('lock')); return active ? [{ ...active }] : [];
  });
  const close = t.mock.method(assignments, 'closeActiveAssignment', async () => { active = null; return 1; });
  const update = t.mock.method(tickets, 'unassignTicket', async () => { row = { ...row, assigned_to: null, status: 'OPEN' }; return 1; });
  const record = t.mock.method(history, 'createHistory', async data => { assert.equal(data.toStatus, 'OPEN'); });
  const notify = t.mock.method(notifications, 'createNotification', async data => { assert.equal(data.userId, 7); return { id: 1 }; });
  t.mock.method(realtime, 'emitNotifications', () => {});
  await assert.rejects(service.unassignTicketByAdmin(5, 10, admin), { statusCode: 409, message: 'Ticket assignment has changed. Refresh and try again.' });
  assert.equal(active.id, 11); assert.equal(row.assigned_to, 7);
  for (const spy of [close, update, record, notify]) assert.equal(spy.mock.callCount(), 0);
  assert.deepEqual(events, ['begin', 'lock', 'rollback', 'release']);
  row.status = 'CLOSED';
  await assert.rejects(service.unassignTicketByAdmin(5, 11, admin), { statusCode: 409 });
  assert.equal(close.mock.callCount(), 0);
  for (const status of ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED']) {
    row = { ...row, status, assigned_to: 7 }; active = { id: 11, technician_id: 7 };
    const result = await service.unassignTicketByAdmin(5, '11', admin);
    assert.equal(result.status, 'OPEN'); assert.equal(result.assignedTo, null); assert.equal(active, null);
  }
  await assert.rejects(service.unassignTicketByAdmin(5, 11, admin), { statusCode: 409, message: 'Ticket is already unassigned' });
  for (const expected of [undefined, null, 0, -1, 'bad', 1.5, '18446744073709551616']) await assert.rejects(service.unassignTicketByAdmin(5, expected, admin), { statusCode: 422 });
  await assert.rejects(service.unassignTicketByAdmin(5, 11, { id: 2, role: 'TECHNICIAN' }), { statusCode: 403 });
});

test('admin detail exposes only active assignment token and technician ID', async t => {
  t.mock.method(tickets, 'findById', async () => ({ id: 5, assigned_to: 7, active_assignment_id: '9007199254740993' }));
  assert.deepEqual((await service.getTicketById(5, admin)).assignment, { id: '9007199254740993', technicianId: 7 });
  assert.equal('assignment' in await service.getTicketById(5, { id: 7, role: 'TECHNICIAN' }), false);
  t.mock.method(tickets, 'findById', async () => ({ id: 5, assigned_to: null, active_assignment_id: null }));
  assert.equal((await service.getTicketById(5, admin)).assignment, null);
});

test('unassign HTTP contract requires expectedAssignmentId and retains ADMIN authorization', async t => {
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'JWT_ACCESS_SECRET']) {
    const previous = process.env[key];
    process.env[key] = 'unassign-test';
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const jwt = require('jsonwebtoken');
  const users = require('../src/modules/users/user.repository');
  t.mock.method(users, 'findById', async id => ({ id, is_active: true, role: id === '1' ? 'ADMIN' : 'TECHNICIAN' }));
  const call = t.mock.method(service, 'unassignTicketByAdmin', async (id, expected, actor) => {
    assert.equal(id, '5'); assert.equal(expected, 11); assert.equal(actor.role, 'ADMIN'); return { id: 5, assignedTo: null, status: 'OPEN' };
  });
  const server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (body, actor = '1') => fetch(`http://127.0.0.1:${server.address().port}/api/v1/tickets/5/unassign`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: actor })}` } : {}) }, body: JSON.stringify(body) });
  for (const expected of [undefined, null, 0, -1, true, 'abc', 1.5]) assert.equal((await request({ expectedAssignmentId: expected })).status, 422);
  assert.equal((await request({ expectedAssignmentId: 11 }, '2')).status, 403);
  assert.equal((await request({ expectedAssignmentId: 11 }, null)).status, 401);
  assert.equal(call.mock.callCount(), 0);
  assert.equal((await request({ expectedAssignmentId: 11 })).status, 200);
});
