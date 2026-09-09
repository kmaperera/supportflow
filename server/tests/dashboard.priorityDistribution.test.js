const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");
const definitions = [{ priority_id: "91", priority_name: "LOW", count: "0" }, { priority_id: "17", priority_name: "CRITICAL", count: "2" },
  { priority_id: "63", priority_name: "MEDIUM", count: null }, { priority_id: "8", priority_name: "HIGH", count: "1" }];

test("priority distribution binds scopes in LEFT JOIN, uses actual IDs and severity order", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const result = await service.getTicketPriorityDistribution({ id: "7", role }, { async query(sql, values) {
      assert.match(sql, /COUNT\(t.id\) AS count/);
      assert.match(sql, /FROM ticket_priorities AS p LEFT JOIN tickets AS t ON t.priority_id = p.id/);
      assert.doesNotMatch(sql, /WHERE|sla_policies|ticket_assignments|is_active/);
      if (role === "ADMIN") assert.deepEqual(values, []);
      else {
        assert.ok(sql.includes(role === "EMPLOYEE" ? "AND t.created_by = ?" : "AND t.assigned_to = ?"));
        assert.deepEqual(values, ["7"]);
      }
      return [definitions];
    } });
    assert.deepEqual(result, [{ priorityId: 17, priorityName: "CRITICAL", count: 2 }, { priorityId: 8, priorityName: "HIGH", count: 1 },
      { priorityId: 63, priorityName: "MEDIUM", count: 0 }, { priorityId: 91, priorityName: "LOW", count: 0 }]);
  }
  for (const rows of [[], definitions.slice(1), [...definitions, { priority_id: 99, priority_name: "URGENT" }], [...definitions, definitions[0]]]) {
    await assert.rejects(service.getTicketPriorityDistribution({ id: 1, role: "ADMIN" }, { async query() { return [rows]; } }), { statusCode: 409 });
  }
  const zero = await service.getTicketPriorityDistribution({ id: 1, role: "ADMIN" }, { async query() {
    return [definitions.map(row => ({ ...row, count: "0" }))];
  } });
  assert.ok(zero.every(row => row.count === 0));
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  await assert.rejects(service.getTicketPriorityDistribution(null, noQuery), { statusCode: 401 });
  await assert.rejects(service.getTicketPriorityDistribution({ id: 1, role: "OTHER" }, noQuery), { statusCode: 403 });
});

test("priority endpoint derives scope from authenticated role and rejects query overrides", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "priority-distribution-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "OTHER" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /^SELECT /);
    if (sql.includes("created_by")) assert.deepEqual(values, ["1"]);
    else if (sql.includes("assigned_to")) assert.deepEqual(values, ["2"]);
    else assert.deepEqual(values, []);
    return [definitions];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/priority-distribution`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["priorityId", "userId", "technicianId", "dateFrom", "dateTo", "role"]) assert.equal((await get(1, `?${key}=2`)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.message, "Ticket priority distribution retrieved successfully");
    assert.deepEqual(body.data.distribution.map(row => row.priorityId), [17, 8, 63, 91]);
  }
});
