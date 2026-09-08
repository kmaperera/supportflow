const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repo = require('../src/modules/notifications/notification.repository');
const notifications = require('../src/modules/notifications/notification.service');
const realtime = require('../src/modules/notifications/notificationRealtime.service');
const sla = require('../src/modules/sla/slaNotification.service');
const ticket = { id: 25, ticketNumber: 'SUP-25', assignedTo: 7,
  createdAt: new Date('2020-01-01T10:00:00Z'), responseDueAt: new Date('2020-01-01T11:00:00Z'),
  resolutionDueAt: new Date('2020-01-01T11:00:00Z'), firstResponseAt: null, resolvedAt: null };
const now = new Date('2020-01-01T10:50:00Z');

test('unique-key errors are no-ops, other failures propagate, keys remain private', async () => {
  const data = { userId: 7, ticketId: 25, type: 'SLA_WARNING', title: 'Title', message: 'Message', dedupeKey: 'sla-warning:response:25:7' };
  let failure;
  const db = { async query(sql, values) {
    if (failure) throw failure;
    if (sql.includes('INSERT')) { assert.equal(values.at(-1), data.dedupeKey); return [{ insertId: 1 }]; }
    return [[{ id: 1, user_id: 7, ticket_id: 25, comment_id: null, type: data.type,
      title: data.title, message: data.message, is_read: 0, read_at: null, created_at: now, dedupe_key: data.dedupeKey }]];
  } };
  const result = await notifications.createNotification(data, db);
  assert.equal('dedupeKey' in result, false);
  assert.equal('dedupe_key' in result, false);
  assert.equal('dedupeKey' in realtime.buildRealtimeNotificationPayload(result), false);
  failure = Object.assign(new Error("Duplicate entry for key 'notifications.uq_notifications_dedupe_key'"), { code: 'ER_DUP_ENTRY' });
  assert.equal(await notifications.createNotification(data, db), null);
  assert.deepEqual(await notifications.createNotifications([data, data], db), []);
  failure = Object.assign(new Error("Duplicate entry for key 'PRIMARY'"), { code: 'ER_DUP_ENTRY' });
  await assert.rejects(repo.createNotification(data, db), err => err === failure);
});

test('warnings route per target and recipient, injected transactions never emit', async t => {
  const keys = new Set(); const rows = []; const db = {};
  t.mock.method(realtime, 'emitNotification', () => assert.fail('early emission'));
  t.mock.method(notifications, 'createNotification', async (data, connection) => {
    assert.equal(connection, db);
    if (keys.has(data.dedupeKey)) return null;
    keys.add(data.dedupeKey); rows.push(data); return data;
  });
  for (let i = 0; i < 3; i++) await sla.createResponseWarningNotification({ ticket, now, db });
  await sla.createResolutionWarningNotification({ ticket, now, db });
  await sla.createResponseWarningNotification({ ticket: { ...ticket, assignedTo: 8 }, now, db });
  assert.deepEqual(rows.map(r => r.dedupeKey), ['sla-warning:response:25:7', 'sla-warning:resolution:25:7', 'sla-warning:response:25:8']);
  assert.deepEqual(rows.map(r => r.userId), [7, 7, 8]);
  assert.deepEqual(rows[0], { userId: 7, ticketId: 25, commentId: null, type: 'SLA_WARNING',
    title: 'Response SLA approaching', message: 'SUP-25 is approaching its first-response SLA deadline.',
    dedupeKey: 'sla-warning:response:25:7' });
  assert.deepEqual(rows[1], { userId: 7, ticketId: 25, commentId: null, type: 'SLA_WARNING',
    title: 'Resolution SLA approaching', message: 'SUP-25 is approaching its resolution SLA deadline.',
    dedupeKey: 'sla-warning:resolution:25:7' });
  for (const changed of [{ assignedTo: null }, { firstResponseAt: now }, { responseDueAt: now }]) {
    assert.equal(await sla.createResponseWarningNotification({ ticket: { ...ticket, ...changed }, now, db }), null);
  }
});

test('both targets skip notifications outside their active warning window', async t => {
  t.mock.method(notifications, 'createNotification', () => assert.fail('unexpected notification'));
  for (const [method, completion] of [['createResponseWarningNotification', 'firstResponseAt'],
    ['createResolutionWarningNotification', 'resolvedAt']]) {
    for (const [changed, instant] of [[{}, '2020-01-01T10:00:00Z'], [{}, '2020-01-01T11:00:00Z'],
      [{}, '2020-01-01T11:00:00.001Z'], [{ assignedTo: null }, '2020-01-01T10:50:00Z'],
      [{ [completion]: now }, '2020-01-01T10:50:00Z']]) {
      assert.equal(await sla[method]({ ticket: { ...ticket, ...changed }, now: new Date(instant), db: {} }), null);
    }
  }
});

for (const fail of [null, 'insert', 'commit']) test(`owned transaction ordering: ${fail || 'success'}`, async t => {
  const events = []; const error = new Error('failure');
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); if (fail === 'commit') throw error; },
    async rollback() { events.push('rollback'); }, release() { events.push('release'); },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(notifications, 'createNotification', async (_, db) => {
    assert.equal(db, connection); events.push('insert'); if (fail === 'insert') throw error; return { id: 1 };
  });
  t.mock.method(realtime, 'emitNotification', () => { events.push('emit'); return false; });
  const call = sla.createResponseWarningNotification({ ticket, now });
  if (fail) { await assert.rejects(call, err => err === error); assert.equal(events.includes('emit'), false); assert.ok(events.includes('rollback')); }
  else { await call; assert.deepEqual(events, ['begin', 'insert', 'commit', 'release', 'emit']); }
});
