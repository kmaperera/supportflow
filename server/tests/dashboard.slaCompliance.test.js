const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

const zero = { trackedTickets: 0, metTickets: 0, missedTickets: 0, pendingTickets: 0, completedTickets: 0, compliancePercentage: null };
const empty = { response: zero, resolution: zero };
const expected = {
  response: { trackedTickets: 4, metTickets: 2, missedTickets: 1, pendingTickets: 1, completedTickets: 3, compliancePercentage: 66.67 },
  resolution: { trackedTickets: 4, metTickets: 1, missedTickets: 1, pendingTickets: 2, completedTickets: 2, compliancePercentage: 50 },
};

function fixtureDatabase() {
  // Numeric timestamp offsets: equality is MET; past deadlines with null completion stay PENDING.
  const tickets = [
    { response: [10, 10], resolution: [20, 21] },
    { response: [10, 9], resolution: [20, 20] },
    { response: [10, 11], resolution: [20, null] },
    { response: [10, null], resolution: [null, 30] },
    { response: [null, 5], resolution: [null, null] },
    { response: [10, -1], resolution: [20, null] },
    { response: [null, null], resolution: [20, -1] },
  ].map(ticket => ({ ...ticket, owner: "1", assigned: "2" }));
  return { tickets, async query(sql, values) {
    assert.doesNotMatch(sql, /NOW|CURRENT_TIMESTAMP|sla_policies|ticket_assignments|UPDATE|INSERT|DELETE|status/);
    const scoped = tickets.filter(ticket => sql.includes("created_by = ?") ? ticket.owner === values[0]
      : sql.includes("assigned_to = ?") ? ticket.assigned === values[0] : true);
    const row = {};
    for (const [dimension, due, completion] of [["response", "response_due_at", "first_response_at"], ["resolution", "resolution_due_at", "resolved_at"]]) {
      assert.ok(sql.includes(`COALESCE(SUM(${due} IS NOT NULL AND (${completion} IS NULL OR ${completion} >= created_at)), 0) AS ${dimension}_tracked`));
      assert.ok(sql.includes(`COALESCE(SUM(${due} IS NOT NULL AND ${completion} IS NULL), 0) AS ${dimension}_pending`));
      for (const [name, operator] of [["met", "<="], ["missed", ">"]]) {
        assert.ok(sql.includes(`COALESCE(SUM(${due} IS NOT NULL AND ${completion} IS NOT NULL AND ${completion} >= created_at AND ${completion} ${operator} ${due}), 0) AS ${dimension}_${name}`));
      }
      const valid = scoped.map(ticket => ticket[dimension]).filter(([deadline, completed]) => deadline !== null && (completed === null || completed >= 0));
      row[`${dimension}_tracked`] = String(valid.length);
      row[`${dimension}_pending`] = String(valid.filter(([, completed]) => completed === null).length);
      row[`${dimension}_met`] = String(valid.filter(([deadline, completed]) => completed !== null && completed <= deadline).length);
      row[`${dimension}_missed`] = String(valid.filter(([deadline, completed]) => completed !== null && completed > deadline).length);
    }
    return [[row]];
  } };
}

test("SLA aggregate uses snapshot semantics independently and binds each role scope", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const db = fixtureDatabase();
    const result = await service.getSlaComplianceMetrics({ id: role === "TECHNICIAN" ? "2" : "1", role }, { async query(sql, values) {
      assert.ok(sql.endsWith(role === "EMPLOYEE" ? " WHERE created_by = ?" : role === "TECHNICIAN" ? " WHERE assigned_to = ?" : " FROM tickets"));
      assert.deepEqual(values, role === "ADMIN" ? [] : [role === "EMPLOYEE" ? "1" : "2"]);
      return db.query(sql, values);
    } });
    assert.deepEqual(result, expected);
    for (const metrics of Object.values(result)) {
      assert.equal(metrics.trackedTickets, metrics.metTickets + metrics.missedTickets + metrics.pendingTickets);
      assert.equal(metrics.completedTickets, metrics.metTickets + metrics.missedTickets);
    }
  }
});

test("SLA percentages distinguish no completed sample from all missed or all met", async () => {
  for (const [met, missed, pending, percentage] of [[0, 0, 0, null], [0, 0, 5, null], [0, 2, 1, 0], [2, 0, 1, 100]]) {
    const result = await service.getSlaComplianceMetrics({ id: 1, role: "ADMIN" }, { async query() {
      return [[{ response_tracked: String(met + missed + pending), response_met: String(met), response_missed: String(missed), response_pending: String(pending), resolution_tracked: null }]];
    } });
    assert.deepEqual(result.response, { trackedTickets: met + missed + pending, metTickets: met, missedTickets: missed, pendingTickets: pending, completedTickets: met + missed, compliancePercentage: percentage });
    assert.deepEqual(result.resolution, zero);
  }
  const db = fixtureDatabase();
  db.tickets.length = 0;
  assert.deepEqual(await service.getSlaComplianceMetrics({ id: 1, role: "ADMIN" }, db), empty);
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  await assert.rejects(service.getSlaComplianceMetrics(null, noQuery), { statusCode: 401 });
  await assert.rejects(service.getSlaComplianceMetrics({ id: 1, role: "OTHER" }, noQuery), { statusCode: 403 });
  await assert.rejects(service.getSlaComplianceMetrics({ id: "1 OR 1=1", role: "EMPLOYEE" }, noQuery), { statusCode: 422 });
});

test("SLA compliance endpoint authenticates, rejects overrides and follows current assignment", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "sla-compliance-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "OTHER", 6: "TECHNICIAN" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  const db = fixtureDatabase();
  const query = t.mock.method(pool, "query", db.query);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/sla-compliance`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["userId", "employeeId", "technicianId", "role", "dateFrom", "dateTo", "month", "year", "priorityId", "startDate", "endDate", "status"]) {
    assert.equal((await get(1, `?${key}=3`)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.message, "SLA compliance metrics retrieved successfully");
    assert.deepEqual(body.data.summary, expected);
  }
  db.tickets.forEach(ticket => { ticket.assigned = "6"; });
  assert.deepEqual((await (await get(2)).json()).data.summary, empty);
  assert.deepEqual((await (await get(6)).json()).data.summary, expected);
});
