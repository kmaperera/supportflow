const realtime = require("../src/modules/notifications/notificationRealtime.service");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const assignments = require("../src/modules/tickets/ticketAssignment.repository");
const history = require("../src/modules/tickets/ticketStatusHistory.repository");
const users = require("../src/modules/users/user.repository");
const notifications = require("../src/modules/notifications/notification.service");
const service = require("../src/modules/tickets/ticket.service");

for (const operation of ["self", "assign", "reassign", "noop", "unassign"]) {
  const count = operation === "noop" ? 0 : operation === "reassign" ? 2 : 1;
  for (let failAt = 0; failAt <= count; failAt++) {
    test(`${operation}: ${failAt ? `notification ${failAt} failure rolls back` : "correct notifications before commit"}`, async (t) => {
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
      const connection = { async beginTransaction() { events.push("begin"); },
        async commit() { events.push("commit"); }, async rollback() { events.push("rollback"); }, release() { events.push("release"); } };
      t.mock.method(pool, "getConnection", async () => connection);
      const previous = ["self", "assign"].includes(operation) ? null : operation === "noop" ? 8 : 7;
      const ticket = { id: 5, ticket_number: "SUP-2026-000005", created_by: 3,
        assigned_to: previous, status: previous === null ? "OPEN" : "ASSIGNED" };
      const check = db => assert.equal(db, connection);
      t.mock.method(tickets, "lockById", async (id, db) => { check(db); return ticket; });
      t.mock.method(tickets, "findById", async (id, db) => { check(db); return { ...ticket }; });
      t.mock.method(assignments, "findActiveAssignmentsByTicketId", async (id, db) => {
        check(db); return previous === null ? [] : [{ technician_id: previous }];
      });
      t.mock.method(users, "findById", async (id, db) => { check(db); return { id: 8, role: "TECHNICIAN", is_active: true }; });
      for (const method of ["assignTechnician", "updateAssignment"]) {
        t.mock.method(tickets, method, async (id, tech, status, db) => { check(db); events.push("ownership"); return 1; });
      }
      t.mock.method(tickets, "unassignTicket", async (id, db) => { check(db); events.push("ownership"); return 1; });
      t.mock.method(assignments, "closeActiveAssignment", async (id, db) => { check(db); events.push("closeHistory"); return 1; });
      t.mock.method(assignments, "createAssignment", async (data, db) => { check(db); events.push("assignmentHistory"); return 1; });
      t.mock.method(history, "createHistory", async (data, db) => { check(db); events.push("statusHistory"); return 1; });
      const saved = [];
      t.mock.method(notifications, "createNotification", async (data, db) => {
        check(db); saved.push(data); events.push("notification");
        if (saved.length === failAt) throw failure;
        return { id: saved.length };
      });
      const admin = { id: 1, role: "ADMIN" };
      const promise = operation === "self" ? service.selfAssignTicket(5, { id: 8, role: "TECHNICIAN" })
        : operation === "unassign" ? service.unassignTicketByAdmin(5, admin)
          : service.assignTicketByAdmin(5, 8, admin);
      if (failAt) {
        await assert.rejects(promise, err => err === failure);
        assert.equal(events.includes("commit"), false);
        assert.deepEqual(events.slice(-2), ["rollback", "release"]);
      } else {
        const result = await promise;
        assert.equal(result.ticketNumber, ticket.ticket_number);
        assert.equal("notifications" in result, false);
        assert.deepEqual(events.slice(-2), ["commit", "release"]);
        assert.equal(saved.length, count);
        if (operation === "noop") assert.deepEqual(events, ["begin", "commit", "release"]);
      }
      assert.equal(emissions.length, failAt ? 0 : count);
      const expected = operation === "unassign"
        ? [[7, "TICKET_UNASSIGNED", "Ticket unassigned", "has been unassigned from you."]]
        : operation === "reassign"
          ? [[8, "TICKET_REASSIGNED", "Ticket reassigned", "has been reassigned to you."],
            [7, "TICKET_REASSIGNED", "Ticket reassigned", "has been reassigned to another technician."]]
          : [[8, "TICKET_ASSIGNED", "Ticket assigned", "has been assigned to you."]];
      saved.forEach((data, i) => {
        const [userId, type, title, suffix] = expected[i];
        assert.deepEqual(data, { userId, ticketId: 5, commentId: null, type, title, message: `${ticket.ticket_number} ${suffix}` });
      });
      if (saved.length) assert.ok(events.indexOf("ownership") < events.indexOf("notification"));
    });
  }
}
