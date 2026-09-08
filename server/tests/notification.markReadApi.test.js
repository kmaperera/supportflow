const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const repository = require("../src/modules/notifications/notification.repository");

test("mark-read API enforces recipient ownership and preserves the first timestamp", async (t) => {
  const identities = { employee: { id: "3", role: "EMPLOYEE" }, technician: { id: "4", role: "TECHNICIAN" }, admin: { id: "1", role: "ADMIN" } };
  const authPath = require.resolve("../src/middleware/authenticate");
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports(req, res, next) {
    req.user = identities[req.headers.authorization];
    if (!req.user) return res.sendStatus(401);
    next();
  } };
  const rows = [
    { id: 20, user_id: "3" }, { id: 21, user_id: "4" }, { id: 22, user_id: "1" },
  ].map(row => ({ ...row, ticket_id: 5, comment_id: null, type: "TICKET_ASSIGNED", title: "Assigned",
    message: "Ticket assigned", is_read: 0, read_at: null, created_at: "created" }));
  const lookup = t.mock.method(repository, "findByIdAndUserId", async (id, userId) => {
    const row = rows.find(value => String(value.id) === id && value.user_id === userId);
    return row ? { ...row } : null;
  });
  const update = t.mock.method(repository, "markAsRead", async (id, userId) => {
    const row = rows.find(value => String(value.id) === id && value.user_id === userId);
    assert.ok(row);
    row.is_read = 1; row.read_at = "first timestamp";
    return 1;
  });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/notifications", require("../src/modules/notifications/notification.routes"));
  app.use(require("../src/middleware/errorHandler"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/notifications`;
  function request(id, identity) {
    return fetch(`${base}/${id}/read?userId=3&recipientId=3&role=ADMIN`, {
      method: "PATCH", headers: { "content-type": "application/json", ...(identity ? { authorization: identity } : {}) },
      body: JSON.stringify({ userId: "3", recipientId: "3", role: "ADMIN" }),
    });
  }
  for (const [identity, id] of [["employee", 20], ["technician", 21], ["admin", 22]]) {
    const first = await request(id, identity);
    assert.equal(first.status, 200);
    const body = await first.json();
    assert.equal(body.message, "Notification marked as read successfully");
    assert.equal(body.data.notification.userId, identities[identity].id);
    assert.equal(body.data.notification.isRead, true);
    assert.equal(body.data.notification.readAt, "first timestamp");
    const second = await request(id, identity);
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), body);
  }
  assert.equal(update.mock.callCount(), 3);
  for (const [identity, id] of [["technician", 20], ["admin", 20], ["employee", 22], ["employee", 999]]) {
    const response = await request(id, identity);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).message, "Notification not found");
  }
  const before = lookup.mock.callCount();
  for (const id of ["0", "-1", "abc", "1.5", "18446744073709551616"]) {
    assert.equal((await request(id, "employee")).status, 422);
  }
  assert.equal((await request("", "employee")).status, 404);
  assert.equal((await request(20)).status, 401);
  assert.equal(lookup.mock.callCount(), before);
  assert.equal(update.mock.callCount(), 3);
});
