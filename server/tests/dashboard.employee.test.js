const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("summary validates identity and maps aggregate numbers including empty SUM values", async () => {
  const noQuery = { async query() { assert.fail("Invalid ID queried SQL"); } };
  for (const id of [0, -1, 1.5, "abc", null, true, "18446744073709551616"]) {
    await assert.rejects(service.getEmployeeDashboardSummary(id, noQuery), { statusCode: 422 });
  }
  const summary = await service.getEmployeeDashboardSummary("18446744073709551615", { async query(sql, values) {
    assert.deepEqual(values, ["18446744073709551615"]);
    assert.match(sql, /FROM tickets WHERE created_by = \?/);
    assert.match(sql, /COALESCE\(SUM\(status IN \('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'\)\), 0\) AS active_tickets/);
    return [[{ total_tickets: "0", open_tickets: null, assigned_tickets: null, in_progress_tickets: null,
      waiting_for_user_tickets: null, resolved_tickets: null, closed_tickets: null, reopened_tickets: null, active_tickets: null }]];
  } });
  assert.equal(Object.keys(summary).length, 9);
  assert.ok(Object.values(summary).every(value => value === 0));
  const failure = new Error("database unavailable");
  await assert.rejects(service.getEmployeeDashboardSummary(1, { async query() { throw failure; } }), e => e === failure);
});

test("employee summary scopes all states to authenticated owner and rejects other roles before SQL", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "dashboard-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "EMPLOYEE" }[id], is_active: 1 }));
  const statuses = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "REOPENED"];
  const tickets = [...statuses.map(status => ({ owner: "1", status })), { owner: "2", status: "OPEN" }];
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /^SELECT COUNT\(\*\)/);
    assert.match(sql, /FROM tickets WHERE created_by = \?/);
    assert.equal(values.length, 1);
    const owned = tickets.filter(ticket => ticket.owner === values[0]);
    const row = { total_tickets: String(owned.length), active_tickets: String(owned.filter(ticket => !["RESOLVED", "CLOSED"].includes(ticket.status)).length) };
    for (const status of statuses) {
      assert.ok(sql.includes(`COALESCE(SUM(status = '${status}'), 0)`));
      row[`${status.toLowerCase()}_tickets`] = String(owned.filter(ticket => ticket.status === status).length);
    }
    return [[row]];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/employee/summary`;
  const get = actor => fetch(`${base}?userId=2&employeeId=2&role=EMPLOYEE`, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "EMPLOYEE" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [2, 3]) assert.equal((await get(actor)).status, 403);
  assert.equal(query.mock.callCount(), 0);
  const response = await get(1);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Employee dashboard summary retrieved successfully", data: {
    summary: { totalTickets: 7, openTickets: 1, assignedTickets: 1, inProgressTickets: 1, waitingForUserTickets: 1,
      resolvedTickets: 1, closedTickets: 1, reopenedTickets: 1, activeTickets: 5 },
  } });
  const empty = await get(4);
  assert.equal(empty.status, 200);
  assert.ok(Object.values((await empty.json()).data.summary).every(value => value === 0));
  assert.equal(query.mock.callCount(), 2);
});
