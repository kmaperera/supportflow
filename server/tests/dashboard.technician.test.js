const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("technician summary validates IDs and preserves numeric zero counters", async () => {
  for (const id of [0, -1, 1.5, "abc", null, true]) await assert.rejects(service.getTechnicianDashboardSummary(id, {
    async query() { assert.fail("Invalid ID reached SQL"); },
  }), { statusCode: 422 });
  let calls = 0;
  const summary = await service.getTechnicianDashboardSummary("2", { async query(sql, values) {
    calls++;
    if (sql.includes("IS NULL")) return [[{ total: "4" }]];
    assert.deepEqual(values, ["2"]);
    assert.match(sql, /FROM tickets WHERE assigned_to = \?/);
    return [[{ assigned_tickets: null, in_progress_tickets: "0", waiting_for_user_tickets: null,
      reopened_tickets: null, resolved_tickets: null, active_assigned_tickets: null }]];
  } });
  assert.equal(calls, 2);
  assert.deepEqual(summary, { assignedTickets: 0, inProgressTickets: 0, waitingForUserTickets: 0,
    reopenedTickets: 0, resolvedTickets: 0, activeAssignedTickets: 0, unassignedQueueTickets: 4 });
});

test("technician API scopes current assignment, follows reassignment/unassignment and rejects other roles", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "technician-dashboard-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "TECHNICIAN" }[id], is_active: 1 }));
  const statuses = ["ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "REOPENED", "RESOLVED"];
  const tickets = [...statuses.map(status => ({ assigned: "2", status })), { assigned: "2", status: "CLOSED" },
    { assigned: "4", status: "ASSIGNED" }, { assigned: null, status: "OPEN" }, { assigned: null, status: "CLOSED" }];
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /^SELECT /);
    assert.doesNotMatch(sql, /ticket_assignments|UPDATE|INSERT/);
    if (sql.includes("IS NULL")) {
      assert.equal(sql, "SELECT COUNT(*) AS total FROM tickets WHERE assigned_to IS NULL");
      return [[{ total: String(tickets.filter(ticket => ticket.assigned === null).length) }]];
    }
    assert.match(sql, /WHERE assigned_to = \?/);
    assert.match(sql, /status IN \('ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'\)/);
    const owned = tickets.filter(ticket => ticket.assigned === values[0]);
    const row = { active_assigned_tickets: String(owned.filter(ticket => statuses.slice(0, 4).includes(ticket.status)).length) };
    for (const status of statuses) row[`${status.toLowerCase()}_tickets`] = String(owned.filter(ticket => ticket.status === status).length);
    return [[row]];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/technician/summary?technicianId=4&userId=4`;
  const get = actor => fetch(url, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "TECHNICIAN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 3]) assert.equal((await get(actor)).status, 403);
  assert.equal(query.mock.callCount(), 0);
  const response = await get(2);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Technician dashboard summary retrieved successfully", data: {
    summary: { assignedTickets: 1, inProgressTickets: 1, waitingForUserTickets: 1, reopenedTickets: 1,
      resolvedTickets: 1, activeAssignedTickets: 4, unassignedQueueTickets: 2 },
  } });
  tickets[0].assigned = "4";
  assert.equal((await (await get(2)).json()).data.summary.activeAssignedTickets, 3);
  assert.equal((await (await get(4)).json()).data.summary.activeAssignedTickets, 2);
  tickets[0].assigned = null; tickets[0].status = "OPEN";
  const unassigned = (await (await get(4)).json()).data.summary;
  assert.equal(unassigned.activeAssignedTickets, 1);
  assert.equal(unassigned.unassignedQueueTickets, 3);
});
