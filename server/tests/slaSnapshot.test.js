const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const policyRepository = require("../src/modules/sla/slaPolicy.repository");
const policies = require("../src/modules/sla/slaPolicy.service");
const service = require("../src/modules/tickets/ticket.service");
const notifications = require("../src/modules/notifications/notification.service");
const realtime = require("../src/modules/notifications/notificationRealtime.service");

test("policy update preserves existing snapshots; future tickets resolve the changed policy", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-02T18:00:00Z") });
  const createdAt = new Date("2026-01-01T10:00:00Z");
  const policy = { id: 83, priority_id: 47, priority_name: "CUSTOM", is_active: 1,
    response_time_minutes: 30, resolution_time_minutes: 240 };
  const rows = new Map();
  let committed = false;
  const db = { async beginTransaction() { committed = false; }, async commit() { committed = true; },
    async rollback() {}, release() {} };
  t.mock.method(pool, "getConnection", async () => db);
  // Fail closed if this test accidentally reaches an unstubbed database path.
  for (const method of ["query", "execute"]) {
    t.mock.method(pool, method, () => assert.fail("unexpected real database access"));
  }
  t.mock.method(tickets, "findCategoryById", async () => ({ id: 12, is_active: 1 }));
  t.mock.method(tickets, "findPriorityById", async id => {
    assert.equal(id, policy.priority_id);
    return { id, name: "CUSTOM", is_active: 1 };
  });
  t.mock.method(policyRepository, "findByPriorityId", async (id, connection) => {
    assert.equal(id, policy.priority_id); assert.equal(connection, db); return { ...policy };
  });
  t.mock.method(policyRepository, "findById", async id => {
    assert.equal(id, policy.id); return { ...policy };
  });
  t.mock.method(policyRepository, "updateById", async (id, values) => {
    assert.equal(id, policy.id);
    assert.deepEqual(Object.keys(values).sort(), ["resolutionTimeMinutes", "responseTimeMinutes"]);
    policy.response_time_minutes = values.responseTimeMinutes;
    policy.resolution_time_minutes = values.resolutionTimeMinutes;
    return 1;
  });
  t.mock.method(tickets, "create", async (data, connection) => {
    assert.equal(connection, db);
    const id = rows.size + 1;
    rows.set(id, { id, created_by: data.createdBy, priority_id: data.priorityId,
      created_at: new Date(createdAt), response_due_at: null, resolution_due_at: null });
    return id;
  });
  t.mock.method(tickets, "assignTicketNumber", async (id, number) => {
    rows.get(id).ticket_number = number; return 1;
  });
  t.mock.method(tickets, "findById", async id => ({ ...rows.get(id) }));
  const writes = t.mock.method(tickets, "updateSlaDeadlines", async (id, deadlines, connection) => {
    assert.equal(connection, db);
    Object.assign(rows.get(id), { response_due_at: deadlines.responseDueAt, resolution_due_at: deadlines.resolutionDueAt });
    return 1;
  });
  t.mock.method(notifications, "createNotification", async (data, connection) => {
    assert.equal(connection, db); assert.equal(committed, false); return data;
  });
  const emits = t.mock.method(realtime, "emitNotifications", () => assert.equal(committed, true));
  const data = { categoryId: 12, priorityId: 47, title: "Snapshot", description: "Snapshot test" };
  const first = await service.createTicket(7, data);
  assert.equal(first.responseDueAt.toISOString(), "2026-01-01T10:30:00.000Z");
  assert.equal(first.resolutionDueAt.toISOString(), "2026-01-01T14:00:00.000Z");
  const snapshot = structuredClone(rows.get(first.id));
  await policies.updatePolicy(policy.id, { responseTimeMinutes: 480, resolutionTimeMinutes: 2880 });
  assert.deepEqual(rows.get(first.id), snapshot);
  assert.equal(writes.mock.callCount(), 1);
  assert.equal(emits.mock.callCount(), 1);
  const second = await service.createTicket(7, data);
  assert.equal(second.responseDueAt.toISOString(), "2026-01-01T18:00:00.000Z");
  assert.equal(second.resolutionDueAt.toISOString(), "2026-01-03T10:00:00.000Z");
  assert.deepEqual(rows.get(first.id), snapshot);
  assert.equal(writes.mock.callCount(), 2);
  assert.equal(emits.mock.callCount(), 2);
});
