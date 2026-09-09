const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

const expected = {
  EMPLOYEE: [["totalTickets", "Total Tickets", 12], ["activeTickets", "Active Tickets", 7], ["resolvedTickets", "Resolved Tickets", 3], ["closedTickets", "Closed Tickets", 2]],
  TECHNICIAN: [["activeAssignedTickets", "Active Assigned", 6], ["assignedTickets", "Assigned", 2], ["waitingForUserTickets", "Waiting for User", 1], ["unassignedQueueTickets", "Unassigned Queue", 4]],
  ADMIN: [["totalTickets", "Total Tickets", 12], ["activeTickets", "Active Tickets", 7], ["unassignedTickets", "Unassigned Tickets", 4], ["resolvedTickets", "Resolved Tickets", 3]],
};
function database(role, id, empty = false) {
  return { async query(sql, values) {
    assert.match(sql, /^SELECT /);
    if (sql.includes("IS NULL")) return [[{ total: empty ? "0" : "4" }]];
    if (sql.includes("FROM users")) { assert.equal(role, "ADMIN"); return [[{}]]; }
    if (role === "EMPLOYEE") { assert.match(sql, /WHERE created_by = \?/); assert.deepEqual(values, [id]); }
    else if (role === "TECHNICIAN") { assert.match(sql, /WHERE assigned_to = \?/); assert.deepEqual(values, [id]); }
    else assert.doesNotMatch(sql, /WHERE/);
    return [[empty ? {} : { total_tickets: "12", active_tickets: "7", resolved_tickets: "3", closed_tickets: "2",
      active_assigned_tickets: "6", assigned_tickets: "2", waiting_for_user_tickets: "1" }]];
  } };
}

test("cards reuse scoped summaries with fixed keys, labels, numeric values and zero handling", async () => {
  for (const role of Object.keys(expected)) {
    assert.deepEqual(await service.getTicketSummaryCards({ id: "7", role }, database(role, "7")),
      expected[role].map(([key, label, value]) => ({ key, label, value })));
    const empty = await service.getTicketSummaryCards({ id: 7, role }, database(role, 7, true));
    assert.ok(empty.every(card => card.value === 0));
  }
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  await assert.rejects(service.getTicketSummaryCards(null, noQuery), { statusCode: 401 });
  await assert.rejects(service.getTicketSummaryCards({ id: 7, role: "OTHER" }, noQuery), { statusCode: 403 });
  await assert.rejects(service.getTicketSummaryCards({ id: 0, role: "ADMIN" }, noQuery), { statusCode: 422 });
});

test("ticket-summary authenticates, rejects query overrides and uses the current database role", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "cards-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "OTHER" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  let current;
  const query = t.mock.method(pool, "query", async (sql, values) => current.query(sql, values));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/ticket-summary`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["userId", "employeeId", "technicianId", "role", "status"]) assert.equal((await get(1, `?${key}=2`)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    current = database(roles[actor], String(actor));
    const response = await get(actor);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: "Ticket summary cards retrieved successfully", data: {
      cards: expected[roles[actor]].map(([key, label, value]) => ({ key, label, value })),
    } });
  }
});
