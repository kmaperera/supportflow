const { test } = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../src/modules/audit/audit.service');
const auditRepository = require('../src/modules/audit/audit.repository');
const adminAudit = require('../src/modules/audit/audit.admin');
const context = { actorUserId: 1, ipAddress: '127.0.0.1' };

test('user role/status/create audit uses actual admin and safe metadata; no-op/conflict emits nothing', async t => {
  const users = require('../src/modules/users/user.repository');
  t.mock.method(require('../src/modules/auth/refreshToken.service'), 'revokeAllUserRefreshTokens', async () => {});
  const service = require('../src/modules/users/user.service');
  const events = [];
  t.mock.method(audit, 'log', async entry => { events.push(entry); return { id: '1' }; });
  let row = { id: 8, role: 'EMPLOYEE', is_active: 1, must_change_password: 1 };
  t.mock.method(users, 'findById', async () => ({ ...row }));
  t.mock.method(users, 'findByEmail', async () => null);
  t.mock.method(users, 'updateRole', async (id, role) => { row.role = role; });
  t.mock.method(users, 'updateStatus', async (id, active) => { row.is_active = active; });
  await service.updateUserRole(8, 'TECHNICIAN', 1, { ...context, actorUserId: 8 });
  assert.deepEqual(events[0], { actorUserId: 1, ipAddress: '127.0.0.1', action: 'USER_ROLE_CHANGED', entityType: 'USER', entityId: 8,
    metadata: { previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN' } });
  await service.updateUserRole(8, 'TECHNICIAN', 1, context);
  await assert.rejects(service.updateUserRole(1, 'EMPLOYEE', 1, context), { statusCode: 400 });
  await assert.rejects(service.updateUserRole(8, 'INVALID', 1, context), { statusCode: 400 });
  assert.equal(events.length, 1);
  await service.updateUserStatus(8, false, 1, context);
  await service.updateUserStatus(8, false, 1, context);
  await service.updateUserStatus(8, true, 1, context);
  assert.deepEqual(events.slice(1).map(e => e.action), ['USER_DEACTIVATED', 'USER_ACTIVATED']);
  t.mock.method(users, 'create', async () => { row = { id: 9, role: 'EMPLOYEE', is_active: 1 }; return 9; });
  await service.createUser({ email: 'fake@example.test', password: 'TestOnlyPassword123', role: 'EMPLOYEE' }, context);
  assert.equal(events.at(-1).action, 'USER_CREATED');
  assert.deepEqual(events.at(-1).metadata, { role: 'EMPLOYEE', isActive: true });
  assert.ok(!JSON.stringify(events).includes('TestOnlyPassword123'));
  t.mock.method(users, 'updateRole', async () => { throw new Error('test mutation failure'); });
  const count = events.length;
  await assert.rejects(service.updateUserRole(9, 'ADMIN', 1, context));
  assert.equal(events.length, count);
});

test('SLA changes are concise; audit DB failure preserves committed business success', async t => {
  t.mock.method(console, 'error', () => {});
  const repository = require('../src/modules/sla/slaPolicy.repository');
  const service = require('../src/modules/sla/slaPolicy.service');
  let row = { id: 4, response_time_minutes: 10, resolution_time_minutes: 20, is_active: 1 };
  t.mock.method(repository, 'findById', async () => ({ ...row }));
  t.mock.method(repository, 'updateById', async (id, values) => { row.response_time_minutes = values.responseTimeMinutes; row.resolution_time_minutes = values.resolutionTimeMinutes; });
  const entries = [];
  t.mock.method(auditRepository, 'create', async entry => { entries.push(entry); throw new Error('test-only-secret SQL'); });
  const updated = await service.updatePolicy(4, { responseTimeMinutes: 15, resolutionTimeMinutes: 20 }, undefined, context);
  assert.equal(updated.responseTimeMinutes, 15);
  assert.deepEqual(entries[0].metadata, { changedFields: ['responseTimeMinutes'], previousResponseMinutes: 10, newResponseMinutes: 15 });
  assert.equal(entries[0].action, 'SLA_POLICY_UPDATED');
  await service.updatePolicy(4, { responseTimeMinutes: 15, resolutionTimeMinutes: 20 }, undefined, context);
  await assert.rejects(service.updatePolicy(4, { responseTimeMinutes: 30, resolutionTimeMinutes: 20 }, undefined, context), { statusCode: 422 });
  assert.equal(entries.length, 1);
});

test('assignment events are transactional, no-op/stale/rollback do not commit success logs', async t => {
  t.mock.method(console, 'error', () => {});
  const pool = require('../src/config/database');
  const tickets = require('../src/modules/tickets/ticket.repository');
  const assignments = require('../src/modules/tickets/ticketAssignment.repository');
  const users = require('../src/modules/users/user.repository');
  const service = require('../src/modules/tickets/ticket.service');
  let row = { id: 5, ticket_number: 'TEST-5', status: 'OPEN', assigned_to: null, priority_id: 1 };
  let active = null, snapshot, pending = [], committed = [], failCommit = false, failAudit = false;
  const order = [];
  const db = {
    async beginTransaction() { snapshot = { row: { ...row }, active }; pending = []; },
    async commit() { order.push('commit'); if (failCommit) throw new Error('test commit failure'); committed.push(...pending); pending = []; },
    async rollback() { row = snapshot.row; active = snapshot.active; pending = []; }, release() {},
    async execute(sql, params) { assert.match(sql, /INSERT INTO audit_logs/); order.push('audit'); if (failAudit) throw new Error('test audit failure'); pending.push(params); return [{ insertId: 1 }]; },
  };
  t.mock.method(pool, 'getConnection', async () => db);
  t.mock.method(tickets, 'lockById', async () => ({ id: 5 }));
  t.mock.method(tickets, 'findById', async () => ({ ...row }));
  t.mock.method(users, 'findById', async id => ({ id, role: 'TECHNICIAN', is_active: 1 }));
  t.mock.method(assignments, 'findActiveAssignmentsByTicketId', async () => active ? [{ ...active }] : []);
  t.mock.method(assignments, 'closeActiveAssignment', async () => { active = null; return 1; });
  let sequence = 10;
  t.mock.method(assignments, 'createAssignment', async data => { active = { id: ++sequence, technician_id: data.technicianId }; return sequence; });
  t.mock.method(tickets, 'updateAssignment', async (id, technician, status) => { row.assigned_to = technician; row.status = status; return 1; });
  t.mock.method(tickets, 'unassignTicket', async () => { row.assigned_to = null; row.status = 'OPEN'; return 1; });
  t.mock.method(require('../src/modules/tickets/ticketStatusHistory.repository'), 'createHistory', async () => {});
  t.mock.method(require('../src/modules/notifications/notification.service'), 'createNotification', async () => ({ id: 1 }));
  t.mock.method(require('../src/modules/notifications/notificationRealtime.service'), 'emitNotifications', () => {});
  const admin = { id: 1, role: 'ADMIN' };
  await service.assignTicketByAdmin(5, 7, admin, context);
  assert.equal(committed[0][1], 'TICKET_ASSIGNED');
  assert.deepEqual(order, ['audit', 'commit']);
  await service.assignTicketByAdmin(5, 7, admin, context);
  assert.equal(committed.length, 1);
  await service.assignTicketByAdmin(5, 9, admin, context);
  assert.equal(committed[1][1], 'TICKET_REASSIGNED');
  assert.deepEqual(JSON.parse(committed[1][5]), { previousTechnicianId: '7', newTechnicianId: '9', previousAssignmentId: '11', newAssignmentId: '12' });
  await assert.rejects(service.unassignTicketByAdmin(5, 11, admin, context), { statusCode: 409 });
  assert.equal(committed.length, 2);
  failCommit = true;
  await assert.rejects(service.unassignTicketByAdmin(5, 12, admin, context));
  assert.equal(committed.length, 2); assert.equal(row.assigned_to, 9);
  failCommit = false; failAudit = true;
  await assert.rejects(service.unassignTicketByAdmin(5, 12, admin, context), { code: 'AUDIT_WRITE_FAILED' });
  assert.equal(row.assigned_to, 9); assert.equal(committed.length, 2);
  failAudit = false;
  await service.unassignTicketByAdmin(5, 12, admin, context);
  assert.equal(committed[2][1], 'TICKET_UNASSIGNED');
  assert.equal(committed[2][0], '1'); assert.equal(committed[2][3], '5');
});

test('KB article metadata contains only changed fields/state, never full content', async t => {
  const repository = require('../src/modules/knowledgeBase/knowledgeBaseArticle.repository');
  const categories = require('../src/modules/knowledgeBase/knowledgeBaseCategory.repository');
  const service = require('../src/modules/knowledgeBase/knowledgeBaseArticle.service');
  let row = { id: 8, category_id: 1, title: 'Test article', slug: 'test-article', content: 'old content', status: 'DRAFT', published_at: null };
  t.mock.method(repository, 'findById', async () => ({ ...row }));
  t.mock.method(repository, 'updateById', async (id, values) => { row.content = values.content; });
  t.mock.method(repository, 'updateStatus', async (id, status, published) => { row.status = status; row.published_at = published; });
  t.mock.method(categories, 'findById', async () => ({ id: 1, is_active: 1 }));
  const entries = [];
  t.mock.method(audit, 'log', async entry => { entries.push(entry); return { id: '1' }; });
  await service.updateArticle(8, { content: 'test-only full private article body' }, undefined, context);
  await service.updateArticle(8, { content: row.content }, undefined, context);
  await service.publishArticle(8, undefined, context); await service.publishArticle(8, undefined, context);
  await service.unpublishArticle(8, undefined, context);
  await service.archiveArticle(8, undefined, context); await service.archiveArticle(8, undefined, context);
  assert.deepEqual(entries.map(e => e.action), ['KB_ARTICLE_UPDATED', 'KB_ARTICLE_PUBLISHED', 'KB_ARTICLE_UNPUBLISHED', 'KB_ARTICLE_ARCHIVED']);
  assert.deepEqual(entries[0].metadata, { changedFields: ['content'] });
  assert.deepEqual(entries[1].metadata, { previousStatus: 'DRAFT', newStatus: 'PUBLISHED' });
  assert.ok(!JSON.stringify(entries).includes('full private article body'));
});

test('request context ignores all client actor/header/body data and new read metadata is allowlisted', () => {
  assert.deepEqual(adminAudit.contextFromRequest({ user: { id: 1 }, ip: '127.0.0.1', body: { actorUserId: 8 }, headers: { 'x-forwarded-for': 'spoof', authorization: 'test-secret' } }), context);
  assert.deepEqual(audit.safeMetadata({ previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN', password: 'test-secret', arbitrary: 'test-secret' }), { previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN' });
});
