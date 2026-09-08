const realtime = require("../src/modules/notifications/notificationRealtime.service");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const notifications = require("../src/modules/notifications/notification.repository");
const service = require("../src/modules/tickets/ticket.service");

for (const failureAt of [null, "category", "priority", "insert", "number", "ticketRead", "notificationInsert", "notificationRead", "commit"]) {
  test(`ticket creation notification transaction: ${failureAt || "success"}`, async (t) => {
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
    const failure = new Error("simulated failure");
    const step = name => { events.push(name); if (failureAt === name) throw failure; };
    const connection = {
      async beginTransaction() { step("begin"); }, async commit() { step("commit"); },
      async rollback() { step("rollback"); }, release() { step("release"); },
    };
    t.mock.method(pool, "getConnection", async () => connection);
    let number;
    t.mock.method(tickets, "findCategoryById", async (id, db) => {
      assert.equal(db, connection); step("category"); return { is_active: true };
    });
    t.mock.method(tickets, "findPriorityById", async (id, db) => {
      assert.equal(db, connection); step("priority"); return { is_active: true };
    });
    t.mock.method(tickets, "create", async (data, db) => {
      assert.equal(db, connection); assert.equal(data.createdBy, "3"); step("insert"); return 123;
    });
    t.mock.method(tickets, "assignTicketNumber", async (id, value, db) => {
      assert.equal(db, connection); number = value; step("number"); return 1;
    });
    t.mock.method(tickets, "findById", async (id, db) => {
      assert.equal(db, connection); step("ticketRead");
      return { id: 123, ticket_number: number, created_by: "3", status: "OPEN", assigned_to: null };
    });
    let saved;
    t.mock.method(notifications, "createNotification", async (data, db) => {
      assert.equal(db, connection);
      assert.deepEqual(data, { userId: "3", ticketId: 123, commentId: null,
        type: "TICKET_CREATED", title: "Ticket created", message: `${number} was created successfully.` });
      saved = data; step("notificationInsert"); return 10;
    });
    t.mock.method(notifications, "findById", async (id, db) => {
      assert.equal(db, connection); assert.equal(id, 10); step("notificationRead");
      return { id, user_id: saved.userId, ticket_id: saved.ticketId, type: saved.type, is_read: 0, read_at: null };
    });
    const promise = service.createTicket("3", { categoryId: 1, priorityId: 1, title: "Title", description: "Description",
      userId: 999, ticketNumber: "spoofed", notificationType: "INTERNAL_NOTE" });
    assert.equal(emissions.length, 0);
    if (failureAt) {
      await assert.rejects(promise, err => err === failure);
      assert.deepEqual(events.slice(-2), ["rollback", "release"]);
      if (failureAt !== "commit") assert.equal(events.includes("commit"), false);
      if (["category", "priority", "insert", "number", "ticketRead"].includes(failureAt)) {
        assert.equal(events.includes("notificationInsert"), false);
      }
    } else {
      const result = await promise;
      assert.equal(result.ticketNumber, number);
      assert.equal(emissions.length, 1);
      assert.match(number, /^SUP-\d{4}-000123$/);
      assert.equal(result.status, "OPEN");
      assert.equal("notification" in result, false);
      assert.deepEqual(events, ["begin", "category", "priority", "insert", "number", "ticketRead",
        "notificationInsert", "notificationRead", "commit", "release"]);
    }
  });
}
