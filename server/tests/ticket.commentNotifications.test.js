const realtime = require("../src/modules/notifications/notificationRealtime.service");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const comments = require("../src/modules/tickets/ticketComment.repository");
const notifications = require("../src/modules/notifications/notification.service");
const service = require("../src/modules/tickets/ticketComment.service");

for (const [role, type, assignedTo, recipient] of [
  ["EMPLOYEE", "PUBLIC", 7, 7], ["EMPLOYEE", "PUBLIC", null, null],
  ["TECHNICIAN", "PUBLIC", 7, 3], ["ADMIN", "PUBLIC", 7, 3],
  ["TECHNICIAN", "INTERNAL", 7, null], ["ADMIN", "INTERNAL", 7, 7],
  ["ADMIN", "INTERNAL", null, null],
]) {
  for (const fail of recipient === null ? [false] : [false, true]) {
    test(`${role} ${type} assigned ${assignedTo}: ${fail ? "rollback" : "recipient and timestamp rules"}`, async (t) => {
      const events = [];
      const emissions = [];
      t.mock.method(realtime, "emitNotifications", rows => {
        assert.equal(events.at(-1), "commit");
        emissions.push(...rows); return true;
      });
      t.mock.method(realtime, "emitNotification", row => {
        assert.equal(events.at(-1), "commit");
        emissions.push(row); return true;
      });
      const failure = new Error("notification failed");
      const db = { async beginTransaction() { events.push("begin"); }, async commit() { events.push("commit"); },
        async rollback() { events.push("rollback"); }, release() { events.push("release"); } };
      t.mock.method(pool, "getConnection", async () => db);
      t.mock.method(tickets, "lockById", async (id, connection) => { assert.equal(connection, db); return { id }; });
      t.mock.method(tickets, "findById", async (id, connection) => {
        assert.equal(connection, db);
        return { id: 5, ticket_number: "SUP-2026-000005", created_by: 3, assigned_to: assignedTo, status: "ASSIGNED" };
      });
      t.mock.method(comments, "createComment", async (data, connection) => {
        assert.equal(connection, db); assert.equal(data.commentType, type); events.push("insert"); return 22;
      });
      const timestamp = t.mock.method(tickets, "setFirstResponseIfUnset", async (id, connection) => {
        assert.equal(connection, db); events.push("timestamp");
      });
      t.mock.method(comments, "findById", async () => ({ id: 22, comment_type: type }));
      const notify = t.mock.method(notifications, "createNotification", async (data, connection) => {
        assert.equal(connection, db);
        assert.deepEqual(data, { userId: recipient, ticketId: 5, commentId: 22,
          type: type === "INTERNAL" ? "INTERNAL_NOTE" : "PUBLIC_COMMENT",
          title: type === "INTERNAL" ? "New internal note" : role === "EMPLOYEE" ? "New ticket reply" : "New support reply",
          message: type === "INTERNAL" ? "A new internal note was added to SUP-2026-000005."
            : role === "EMPLOYEE" ? "A new reply was added to SUP-2026-000005." : "Support replied to SUP-2026-000005." });
        events.push("notification"); if (fail) throw failure; return { ...data, id: 22 };
      });
      const actor = { id: role === "EMPLOYEE" ? 3 : role === "TECHNICIAN" ? 7 : 1, role };
      const operation = type === "PUBLIC" ? service.createPublicComment(5, "Reply", actor) : service.createInternalNote(5, "Note", actor);
      if (fail) await assert.rejects(operation, err => err === failure);
      else assert.equal((await operation).id, 22);
      assert.equal(notify.mock.callCount(), recipient === null ? 0 : 1);
      assert.equal(emissions.length, fail || recipient === null ? 0 : 1);
      assert.equal(timestamp.mock.callCount(), type === "PUBLIC" && role !== "EMPLOYEE" ? 1 : 0);
      assert.deepEqual(events.slice(-2), [fail ? "rollback" : "commit", "release"]);
      if (recipient !== null) assert.ok(events.indexOf("insert") < events.indexOf("notification"));
    });
  }
}
