const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const repository = require("../src/modules/notifications/notification.repository");

test("read-all API scopes every role to its own unread rows and is idempotent", async (t) => {
  const identities = { employee: { id: "3", role: "EMPLOYEE" }, technician: { id: "4", role: "TECHNICIAN" }, admin: { id: "1", role: "ADMIN" } };
  const authPath = require.resolve("../src/middleware/authenticate");
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports(req, res, next) {
    req.user = identities[req.headers.authorization];
    if (!req.user) return res.sendStatus(401);
    next();
  } };
  const rows = Object.values(identities).flatMap(user => [
    { userId: user.id, isRead: false, readAt: null },
    { userId: user.id, isRead: true, readAt: "original" },
  ]);
  const update = t.mock.method(repository, "markAllAsReadByUserId", async userId => {
    const unread = rows.filter(row => row.userId === userId && !row.isRead);
    unread.forEach(row => { row.isRead = true; row.readAt = "first read"; });
    return unread.length;
  });
  t.mock.method(repository, "countUnreadByUserId", async userId => rows.filter(row => row.userId === userId && !row.isRead).length);
  const router = require("../src/modules/notifications/notification.routes");
  const paths = router.stack.filter(layer => layer.route).map(layer => layer.route.path);
  assert.ok(paths.indexOf("/read-all") < paths.indexOf("/:notificationId/read"));
  const app = express();
  app.use(express.json());
  app.use("/api/v1/notifications", router);
  app.use(require("../src/middleware/errorHandler"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/notifications/read-all`;
  for (const identity of ["admin", "employee", "technician"]) {
    const others = rows.filter(row => row.userId !== identities[identity].id).map(row => ({ ...row }));
    for (const updatedCount of [1, 0]) {
      const response = await fetch(`${url}?userId=999&recipientId=999&role=ADMIN`, {
        method: "PATCH", headers: { authorization: identity, "content-type": "application/json" },
        body: JSON.stringify({ userId: "999", recipientId: "999", role: "ADMIN" }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, message: "All notifications marked as read successfully", data: { updatedCount, unreadCount: 0 } });
      assert.equal(update.mock.calls.at(-1).arguments[0], identities[identity].id);
    }
    assert.deepEqual(rows.filter(row => row.userId !== identities[identity].id), others);
  }
  assert.ok(rows.filter(row => row.readAt === "original").length === 3);
  const empty = await fetch(url, { method: "PATCH", headers: { authorization: "employee" } });
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).data, { updatedCount: 0, unreadCount: 0 });
  const before = update.mock.callCount();
  assert.equal((await fetch(url, { method: "PATCH" })).status, 401);
  assert.equal(update.mock.callCount(), before);
});
