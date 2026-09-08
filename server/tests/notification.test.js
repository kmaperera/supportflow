const { test } = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/modules/notifications/notification.repository");
const service = require("../src/modules/notifications/notification.service");
const { NOTIFICATION_TYPES } = require("../src/constants/notificationTypes");

const data = { userId: "5", type: "TICKET_CREATED", title: " Title ", message: " Message " };

test("feed normalizes pagination and keeps unread total independent", async (t) => {
  const find = t.mock.method(repository, "findByUserId", async () => []);
  const count = t.mock.method(repository, "countByUserId", async () => 45);
  const unread = t.mock.method(repository, "countUnreadByUserId", async () => 7);
  let result = await service.getUserNotifications("5", { page: "2", limit: "20", unreadOnly: "false" });
  assert.deepEqual(find.mock.calls[0].arguments, ["5", { unreadOnly: false, limit: 20, offset: 20 }]);
  assert.deepEqual(count.mock.calls[0].arguments, ["5", { unreadOnly: false }]);
  assert.deepEqual(unread.mock.calls[0].arguments, ["5"]);
  assert.deepEqual(result.pagination, { page: 2, limit: 20, total: 45, totalPages: 3, hasNextPage: true, hasPreviousPage: true });
  assert.equal(result.unreadCount, 7);
  await service.getUserNotifications(5, { unreadOnly: "true" });
  assert.deepEqual(find.mock.calls[1].arguments, [5, { unreadOnly: true, limit: 20, offset: 0 }]);
  count.mock.mockImplementation(async () => 0);
  result = await service.getUserNotifications(5);
  assert.deepEqual(result, { notifications: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }, unreadCount: 7 });
  const before = find.mock.callCount();
  for (const options of [{ page: 0 }, { page: "1.5" }, { page: [] }, { page: Number.MAX_SAFE_INTEGER, limit: 100 },
    { limit: 101 }, { limit: 0 }, { unreadOnly: "yes" }, { unreadOnly: 1 }, { unreadOnly: [] }]) {
    await assert.rejects(service.getUserNotifications(5, options), { statusCode: 422 });
  }
  await assert.rejects(service.getUserNotifications(0), { statusCode: 422 });
  assert.equal(find.mock.callCount(), before);
});

test("authenticated feed uses identity only and rejects query manipulation", async (t) => {
  const express = require("express");
  const authPath = require.resolve("../src/middleware/authenticate");
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports(req, res, next) {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.user = { id: "5", role: req.headers.authorization };
    next();
  } };
  const find = t.mock.method(repository, "findByUserId", async (userId) => {
    assert.equal(userId, "5"); return [];
  });
  t.mock.method(repository, "countByUserId", async userId => { assert.equal(userId, "5"); return 0; });
  t.mock.method(repository, "countUnreadByUserId", async userId => { assert.equal(userId, "5"); return 0; });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/notifications", require("../src/modules/notifications/notification.routes"));
  app.use(require("../src/middleware/errorHandler"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/notifications`;
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const response = await fetch(url, { headers: { authorization: role } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: "Notifications retrieved successfully",
      data: { notifications: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }, unreadCount: 0 } });
  }
  const before = find.mock.callCount();
  for (const query of ["userId=9", "recipientId=9", "role=ADMIN", "sort=id", "page=0", "limit=101",
    "unreadOnly=0", "unreadOnly=False", "page=1&page=2", "unreadOnly=true&unreadOnly=false"]) {
    assert.equal((await fetch(`${url}?${query}`, { headers: { authorization: "ADMIN" } })).status, 422);
  }
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(`${url}/9`, { headers: { authorization: "ADMIN" } })).status, 404);
  assert.equal(find.mock.callCount(), before);
});

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
