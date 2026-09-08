const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const history = require("../src/modules/tickets/ticketStatusHistory.repository");
const notifications = require("../src/modules/notifications/notification.service");
const service = require("../src/modules/tickets/ticket.service");

for (const [method, target, verb] of [["resolveTicket", "RESOLVED", "resolved"],
  ["reopenTicket", "REOPENED", "reopened"], ["closeTicket", "CLOSED", "closed"]]) {
  for (const role of method === "resolveTicket" ? ["TECHNICIAN", "ADMIN"] : ["EMPLOYEE", "ADMIN"]) {
    for (const assignedTo of method === "resolveTicket" ? [7] : [7, null]) {
      for (const fail of assignedTo === null ? [false] : [false, true]) {
        test(`${method} ${role} assigned=${assignedTo} ${fail ? "rollback" : "success"}`, async (t) => {
          const events = [];
          const failure = new Error("notification failed");
          const db = { async beginTransaction() { events.push("begin"); }, async commit() { events.push("commit"); },
            async rollback() { events.push("rollback"); }, release() { events.push("release"); } };
          t.mock.method(pool, "getConnection", async () => db);
          const ticket = { id: 5, ticket_number: "SUP-2026-000005", created_by: 3, assigned_to: assignedTo,
            status: method === "resolveTicket" ? "IN_PROGRESS" : "RESOLVED" };
          t.mock.method(tickets, "lockById", async (id, connection) => { assert.equal(connection, db); return ticket; });
          t.mock.method(tickets, "findById", async (id, connection) => { assert.equal(connection, db); return { ...ticket }; });
          t.mock.method(tickets, method, async (...args) => {
            assert.equal(args.at(-1), db);
            if (method === "resolveTicket") assert.equal(args[1], "Issue was resolved");
            events.push("update"); return 1;
          });
          t.mock.method(history, "createHistory", async (data, connection) => {
            assert.equal(connection, db); assert.equal(data.toStatus, target); events.push("history");
          });
          const notify = t.mock.method(notifications, "createNotification", async (data, connection) => {
            assert.equal(connection, db);
            assert.deepEqual(data, { userId: method === "resolveTicket" ? 3 : 7, ticketId: 5, commentId: null,
              type: `TICKET_${target}`, title: `Ticket ${verb}`, message: `SUP-2026-000005 has been ${verb}.` });
            events.push("notification"); if (fail) throw failure;
          });
          const actor = { id: role === "ADMIN" ? 1 : role === "EMPLOYEE" ? 3 : 7, role };
          const promise = method === "resolveTicket" ? service[method](5, " Issue was resolved ", actor) : service[method](5, actor);
          if (fail) await assert.rejects(promise, err => err === failure);
          else {
            const result = await promise;
            assert.equal(result.assignedTo, assignedTo);
            assert.equal("notification" in result, false);
          }
          assert.equal(notify.mock.callCount(), assignedTo === null ? 0 : 1);
          assert.deepEqual(events, ["begin", "update", "history", ...(assignedTo === null ? [] : ["notification"]),
            fail ? "rollback" : "commit", "release"]);
        });
      }
    }
  }
}
