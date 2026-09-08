const { test } = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/modules/notifications/notification.repository");
const service = require("../src/modules/notifications/notification.service");
const { NOTIFICATION_TYPES } = require("../src/constants/notificationTypes");

const data = { userId: "5", type: "TICKET_CREATED", title: " Title ", message: " Message " };

test("creation trims, maps and preserves supplied connection and exact batch IDs", async () => {
  const rows = new Map();
  let nextId = 10;
  const db = { async query(sql, values) {
    if (sql.includes("INSERT")) {
      assert.doesNotMatch(sql, /is_read|read_at|created_at/);
      const [user_id, ticket_id, comment_id, type, title, message] = values;
      assert.equal(title, "Title"); assert.equal(message, "Message");
      const id = nextId; nextId += 7;
      rows.set(id, { id, user_id, ticket_id, comment_id, type, title, message,
        is_read: 0, read_at: null, created_at: "now", secret: "hidden" });
      return [{ insertId: id }];
    }
    return [[rows.get(values[0])].filter(Boolean)];
  } };
  const created = await service.createNotification(data, db);
  assert.deepEqual(created, { id: 10, userId: "5", ticketId: null, commentId: null,
    type: "TICKET_CREATED", title: "Title", message: "Message", isRead: false, readAt: null, createdAt: "now" });
  assert.deepEqual((await service.createNotifications([data, data], db)).map(row => row.id), [17, 24]);
  assert.equal(await service.getNotificationById(99, db), null);
  assert.deepEqual(await service.createNotifications([], db), []);
  assert.deepEqual(await repository.createNotifications([], db), []);
});

test("invalid data and sparse batches fail before persistence", async () => {
  let calls = 0;
  const db = { async query() { calls++; throw new Error("unexpected query"); } };
  for (const invalid of [null, [], {}, { ...data, userId: 0 }, { ...data, userId: Number.MAX_SAFE_INTEGER + 1 },
    { ...data, ticketId: "18446744073709551616" }, { ...data, commentId: -1 },
    { ...data, type: "UNKNOWN" }, { ...data, title: " " }, { ...data, title: "x".repeat(256) }, { ...data, message: " " }]) {
    await assert.rejects(service.createNotification(invalid, db), { statusCode: 422 });
    await assert.rejects(service.createNotifications([data, invalid], db), { statusCode: 422 });
  }
  await assert.rejects(service.createNotifications(new Array(2), db), { statusCode: 422 });
  await assert.rejects(service.createNotifications({}, db), { statusCode: 422 });
  await assert.rejects(service.getNotificationById(0, db), { statusCode: 422 });
  await assert.rejects(service.getUnreadCount(0, db), { statusCode: 422 });
  assert.equal(calls, 0);
  assert.equal(Object.isFrozen(NOTIFICATION_TYPES), true);
  assert.equal(Object.keys(NOTIFICATION_TYPES).length, 13);
});

test("repository binds pagination and filters counts without business side effects", async () => {
  let query;
  const db = { async query(sql, values) { query = { sql, values }; return sql.includes("COUNT") ? [[{ total: "4" }]] : [[]]; } };
  assert.deepEqual(await repository.findByUserId(5, {}, db), []);
  assert.deepEqual(query.values, [5, 20, 0]);
  assert.match(query.sql, /ORDER BY created_at DESC, id DESC LIMIT \? OFFSET \?/);
  await repository.findByUserId(5, { unreadOnly: true, limit: 10, offset: 20 }, db);
  assert.deepEqual(query.values, [5, 10, 20]);
  assert.match(query.sql, /is_read = FALSE/);
  assert.equal(await repository.countByUserId(5, {}, db), 4);
  assert.doesNotMatch(query.sql, /is_read = FALSE/);
  assert.equal(await service.getUnreadCount(5, db), 4);
  assert.match(query.sql, /is_read = FALSE/);
  assert.deepEqual(query.values, [5]);
});

test("database failures propagate and missing created rows are errors", async () => {
  const failure = new Error("database failure");
  await assert.rejects(service.createNotification(data, { async query() { throw failure; } }), err => err === failure);
  await assert.rejects(service.createNotification(data, { async query(sql) {
    return sql.includes("INSERT") ? [{ insertId: 1 }] : [[]];
  } }), { statusCode: 500 });
  for (const [value, expected] of [[0, false], ["0", false], [1, true], ["1", true], [true, true]]) {
    assert.equal(service.mapNotification({ is_read: value }).isRead, expected);
  }
});
