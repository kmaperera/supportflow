const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database(empty = false) {
  let calls = 0;
  return { get calls() { return calls; }, async query(sql) {
    calls++;
    assert.match(sql, /^SELECT /);
    assert.doesNotMatch(sql, /UPDATE|INSERT|DELETE|refresh_tokens/);
    if (sql.includes("assigned_to IS NULL")) {
      assert.equal(sql, "SELECT COUNT(*) AS total FROM tickets WHERE assigned_to IS NULL");
      return [[{ total: empty ? "0" : "3" }]];
    }
    assert.doesNotMatch(sql, /WHERE/);
    if (sql.includes("FROM users")) {
      assert.match(sql, /role = 'EMPLOYEE' AND is_active = TRUE/);
      assert.match(sql, /role = 'TECHNICIAN' AND is_active = TRUE/);
      return [[{ total_employees: empty ? null : "5", active_employees: empty ? null : "4",
        total_technicians: empty ? null : "3", active_technicians: empty ? null : "2" }]];
    }
    const row = { total_tickets: empty ? "0" : "28", active_tickets: empty ? null : "17" };
    ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "REOPENED"].forEach((status, i) => {
      assert.ok(sql.includes(`COALESCE(SUM(status = '${status}'), 0)`));
      row[`${status.toLowerCase()}_tickets`] = empty ? null : String(i + 1);
    });
    assert.match(sql, /status IN \('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'\)/);
    return [[row]];
  } };
}

test("global summary uses three read-only aggregates and normalizes all counters", async () => {
  const db = database();
  const result = await service.getAdminDashboardSummary(db);
  assert.equal(db.calls, 3);
  assert.equal(result.totalTickets, 28);
  assert.equal(result.totalTickets, result.openTickets + result.assignedTickets + result.inProgressTickets + result.waitingForUserTickets + result.resolvedTickets + result.closedTickets + result.reopenedTickets);
  assert.equal(result.activeTickets, result.openTickets + result.assignedTickets + result.inProgressTickets + result.waitingForUserTickets + result.reopenedTickets);
  assert.notEqual(result.unassignedTickets, result.openTickets);
  assert.ok(Object.values(result).every(value => typeof value === "number"));
  const empty = await service.getAdminDashboardSummary(database(true));
  assert.equal(Object.keys(empty).length, 14);
  assert.ok(Object.values(empty).every(value => value === 0));
  const failure = new Error("database unavailable");
  await assert.rejects(service.getAdminDashboardSummary({ async query() { throw failure; } }), e => e === failure);
});

test("admin summary route rejects other roles before SQL and ignores user-scoping parameters", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "admin-dashboard-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN" }[id], is_active: 1 }));
  const db = database();
  t.mock.method(pool, "query", db.query);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/admin/summary?userId=1&role=ADMIN`;
  const get = actor => fetch(url, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 2]) assert.equal((await get(actor)).status, 403);
  assert.equal(db.calls, 0);
  const response = await get(3);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Admin dashboard summary retrieved successfully", data: {
    summary: { totalTickets: 28, openTickets: 1, assignedTickets: 2, inProgressTickets: 3, waitingForUserTickets: 4,
      resolvedTickets: 5, closedTickets: 6, reopenedTickets: 7, activeTickets: 17, unassignedTickets: 3,
      totalEmployees: 5, activeEmployees: 4, totalTechnicians: 3, activeTechnicians: 2 },
  } });
  assert.equal(db.calls, 3);
});
