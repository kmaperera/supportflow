const realtime = require("../src/modules/notifications/notificationRealtime.service");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const history = require("../src/modules/tickets/ticketStatusHistory.repository");
const notifications = require("../src/modules/notifications/notification.service");
const service = require("../src/modules/tickets/ticket.service");

for (const role of ["TECHNICIAN", "ADMIN"]) {
  for (const [from, to] of [["ASSIGNED", "IN_PROGRESS"], ["IN_PROGRESS", "WAITING_FOR_USER"],
    ["WAITING_FOR_USER", "IN_PROGRESS"], ["REOPENED", "IN_PROGRESS"]]) {
    for (const failNotification of [false, true]) {
      test(`${role} ${from} to ${to}: ${failNotification ? "notification failure rolls back" : "one creator notification"}`, async (t) => {
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
        const failure = new Error("notification failure");
        const db = { async beginTransaction() { events.push("begin"); }, async commit() { events.push("commit"); },
          async rollback() { events.push("rollback"); }, release() { events.push("release"); } };
        t.mock.method(pool, "getConnection", async () => db);
        const ticket = { id: 5, created_by: 3, assigned_to: 7, status: from, ticket_number: "SUP-2026-000005" };
        t.mock.method(tickets, "lockById", async (id, connection) => { assert.equal(connection, db); return ticket; });
        t.mock.method(tickets, "findById", async (id, connection) => { assert.equal(connection, db); return ticket; });
        t.mock.method(tickets, "updateWorkingStatus", async (id, status, firstResponse, connection) => {
          assert.equal(connection, db); assert.equal(status, to); assert.equal(firstResponse, from === "ASSIGNED");
          events.push("status"); return 1;
        });
        t.mock.method(history, "createHistory", async (data, connection) => {
          assert.equal(connection, db); assert.equal(data.fromStatus, from); assert.equal(data.toStatus, to);
          events.push("history");
        });
        const notify = t.mock.method(notifications, "createNotification", async (data, connection) => {
          assert.equal(connection, db);
          assert.deepEqual(data, { userId: 3, ticketId: 5, commentId: null, type: "STATUS_CHANGED", title: "Ticket status updated",
            message: `SUP-2026-000005 status changed to ${to === "IN_PROGRESS" ? "In Progress" : "Waiting for User"}.` });
          events.push("notification"); if (failNotification) throw failure;
        });
        const operation = service.updateTicketStatus(5, to, { id: role === "ADMIN" ? 1 : 7, role });
        if (failNotification) await assert.rejects(operation, err => err === failure);
        else assert.equal((await operation).id, 5);
        assert.equal(notify.mock.callCount(), 1);
        assert.equal(emissions.length, failNotification ? 0 : 1);
        assert.deepEqual(events, ["begin", "status", "history", "notification", failNotification ? "rollback" : "commit", "release"]);
      });
    }
  }
}

test("excluded targets and invalid transitions create no notifications", async (t) => {
  const db = { async beginTransaction() {}, async rollback() {}, release() {} };
  t.mock.method(pool, "getConnection", async () => db);
  const ticket = { id: 5, created_by: 3, assigned_to: 7, status: "IN_PROGRESS" };
  t.mock.method(tickets, "lockById", async () => ticket);
  t.mock.method(tickets, "findById", async () => ticket);
  const notify = t.mock.method(notifications, "createNotification", async () => {});
  const update = t.mock.method(tickets, "updateWorkingStatus", async () => 1);
  for (const target of ["RESOLVED", "REOPENED", "CLOSED", "ASSIGNED", "OPEN"]) {
    await assert.rejects(service.updateTicketStatus(5, target, { id: 7, role: "TECHNICIAN" }), { statusCode: 400 });
  }
  await assert.rejects(service.updateTicketStatus(5, "IN_PROGRESS", { id: 7, role: "TECHNICIAN" }), { statusCode: 409 });
  await assert.rejects(service.updateTicketStatus(5, "WAITING_FOR_USER", { id: 8, role: "TECHNICIAN" }), { statusCode: 404 });
  ticket.assigned_to = null;
  await assert.rejects(service.updateTicketStatus(5, "WAITING_FOR_USER", { id: 1, role: "ADMIN" }), { statusCode: 409 });
  assert.equal(notify.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});
