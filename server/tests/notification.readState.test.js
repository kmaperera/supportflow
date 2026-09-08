const { test } = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/modules/notifications/notification.repository");
const service = require("../src/modules/notifications/notification.service");

test("read transitions are recipient scoped, idempotent and use the provided connection", async () => {
  const rows = [
    { id: 1, user_id: 5, is_read: 0, read_at: null },
    { id: 2, user_id: 5, is_read: 1, read_at: "original" },
    { id: 3, user_id: 6, is_read: 0, read_at: null },
    { id: 4, user_id: 5, is_read: 0, read_at: null },
  ];
  let writes = 0;
  const db = { async query(sql, values) {
    if (sql.includes("COUNT")) {
      assert.match(sql, /WHERE user_id = \? AND is_read = FALSE/);
      return [[{ total: rows.filter(r => r.user_id === values[0] && !r.is_read).length }]];
    }
    if (sql.includes("SELECT")) {
      assert.match(sql, /WHERE id = \? AND user_id = \? LIMIT 1/);
      return [rows.filter(r => r.id === values[0] && r.user_id === values[1]).map(r => ({ ...r }))];
    }
    writes++;
    const single = sql.includes("COALESCE");
    assert.match(sql, single ? /WHERE id = \? AND user_id = \? AND is_read = FALSE/ : /WHERE user_id = \? AND is_read = FALSE/);
    assert.match(sql, single ? /read_at = COALESCE\(read_at, CURRENT_TIMESTAMP\)/ : /read_at = CURRENT_TIMESTAMP/);
    const matching = rows.filter(r => !r.is_read && (single ? r.id === values[0] && r.user_id === values[1] : r.user_id === values[0]));
    matching.forEach(r => { r.is_read = 1; r.read_at = r.read_at || "now"; });
    return [{ affectedRows: matching.length }];
  } };
  const result = await service.markNotificationAsRead(1, 5, db);
  assert.equal(result.isRead, true);
  assert.equal(result.readAt, "now");
  assert.equal("is_read" in result, false);
  assert.deepEqual(await service.markNotificationAsRead(1, 5, db), result);
  assert.equal(writes, 1);
  for (const id of [3, 99]) await assert.rejects(service.markNotificationAsRead(id, 5, db), { statusCode: 404, message: "Notification not found" });
  assert.equal(writes, 1);
  assert.equal(await repository.markAsRead(3, 5, db), 0);
  assert.deepEqual(await service.markAllNotificationsAsRead(5, db), { updatedCount: 1, unreadCount: 0 });
  assert.deepEqual(await service.markAllNotificationsAsRead(5, db), { updatedCount: 0, unreadCount: 0 });
  assert.equal(rows[1].read_at, "original");
  assert.equal(rows[2].is_read, 0);
  assert.equal(rows[2].read_at, null);
});

test("invalid IDs never query; concurrent read and database failures are handled", async (t) => {
  const db = { async query() { throw new Error("unexpected query"); } };
  for (const invalid of [0, -1, "1.5", null, [], Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.markNotificationAsRead(invalid, 5, db), { statusCode: 422 });
    await assert.rejects(service.markNotificationAsRead(1, invalid, db), { statusCode: 422 });
    await assert.rejects(service.markAllNotificationsAsRead(invalid, db), { statusCode: 422 });
  }
  let calls = 0;
  t.mock.method(repository, "findByIdAndUserId", async (id, userId, connection) => {
    assert.equal(connection, db);
    return ++calls === 1 ? { is_read: 0, read_at: null } : { is_read: 1, read_at: "concurrent timestamp" };
  });
  const update = t.mock.method(repository, "markAsRead", async (id, userId, connection) => {
    assert.equal(connection, db); return 0;
  });
  assert.equal((await service.markNotificationAsRead(1, 5, db)).readAt, "concurrent timestamp");
  calls = 0;
  const failure = new Error("database failure");
  update.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(service.markNotificationAsRead(1, 5, db), err => err === failure);
});
