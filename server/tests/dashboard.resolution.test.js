const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("resolution aggregate binds authenticated scopes and uses only valid persisted durations", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const result = await service.getAverageResolutionTime({ id: "7", role }, { async query(sql, values) {
      const scope = role === "EMPLOYEE" ? " AND created_by = ?" : role === "TECHNICIAN" ? " AND assigned_to = ?" : "";
      assert.equal(sql.replace(/\s+/g, " "), "SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, resolved_at)) AS average_resolution_seconds, COUNT(*) AS resolved_tickets FROM tickets WHERE resolved_at IS NOT NULL AND resolved_at >= created_at" + scope);
      assert.deepEqual(values, role === "ADMIN" ? [] : ["7"]);
      return [[{ average_resolution_seconds: "2550.0000", resolved_tickets: "8" }]];
    } });
    assert.deepEqual(result, { averageResolutionMinutes: 42.5, resolvedTickets: 8 });
  }
});

test("resolution minutes distinguish no sample from zero and round numeric seconds", async () => {
  for (const [seconds, count, minutes] of [[null, "0", null], ["0", "1", 0], ["1", "1", 0.02], ["61", "2", 1.02], ["86400", "1", 1440]]) {
    const result = await service.getAverageResolutionTime({ id: 1, role: "ADMIN" }, { async query() {
      return [[{ average_resolution_seconds: seconds, resolved_tickets: count }]];
    } });
    assert.deepEqual(result, { averageResolutionMinutes: minutes, resolvedTickets: Number(count) });
    assert.ok(Number.isInteger(result.resolvedTickets));
  }
  const noQuery = { async query() { assert.fail("Unexpected database access"); } };
  await assert.rejects(service.getAverageResolutionTime(null, noQuery), { statusCode: 401 });
  await assert.rejects(service.getAverageResolutionTime({ id: 1, role: "OTHER" }, noQuery), { statusCode: 403 });
  await assert.rejects(service.getAverageResolutionTime({ id: "1 OR 1=1", role: "EMPLOYEE" }, noQuery), { statusCode: 422 });
});

test("resolution endpoint authenticates, rejects overrides and follows current assignment", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "resolution-analytics-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "OTHER", 6: "TECHNICIAN" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  // Fixtures include unresolved and invalid resolutions, both SLA outcomes, and terminal statuses.
  const tickets = [
    { owner: "1", assigned: "2", seconds: 60, status: "RESOLVED", sla: "MET" },
    { owner: "5", assigned: "6", seconds: 180, status: "CLOSED", sla: "MISSED" },
    { owner: "1", assigned: "2", seconds: null, status: "REOPENED" },
    { owner: "1", assigned: "2", seconds: -60, status: "IN_PROGRESS" },
  ];
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /resolved_at IS NOT NULL AND resolved_at >= created_at/);
    assert.doesNotMatch(sql, /due_at|closed_at|NOW\(|status|sla|ticket_assignments|UPDATE|INSERT|DELETE/);
    const included = tickets.filter(ticket => ticket.seconds !== null && ticket.seconds >= 0)
      .filter(ticket => sql.includes("created_by = ?") ? ticket.owner === values[0]
        : sql.includes("assigned_to = ?") ? ticket.assigned === values[0] : true);
    return [[{ average_resolution_seconds: included.length ? String(included.reduce((sum, ticket) => sum + ticket.seconds, 0) / included.length) : null,
      resolved_tickets: String(included.length) }]];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/average-resolution-time`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["userId", "employeeId", "technicianId", "role", "dateFrom", "dateTo", "month", "year"]) {
    assert.equal((await get(1, `?${key}=3`)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: "Average resolution time retrieved successfully",
      data: { summary: { averageResolutionMinutes: actor === 3 ? 2 : 1, resolvedTickets: actor === 3 ? 2 : 1 } } });
  }
  // Closing retains the persisted resolution; reopening clears it in the existing workflow.
  tickets[0].status = "CLOSED";
  assert.deepEqual((await (await get(2)).json()).data.summary, { averageResolutionMinutes: 1, resolvedTickets: 1 });
  tickets[0].status = "REOPENED";
  tickets[0].seconds = null;
  assert.deepEqual((await (await get(2)).json()).data.summary, { averageResolutionMinutes: null, resolvedTickets: 0 });
  tickets[0].status = "RESOLVED";
  tickets[0].seconds = 60;
  tickets[0].assigned = "6";
  assert.deepEqual((await (await get(2)).json()).data.summary, { averageResolutionMinutes: null, resolvedTickets: 0 });
  assert.deepEqual((await (await get(6)).json()).data.summary, { averageResolutionMinutes: 2, resolvedTickets: 2 });
});
