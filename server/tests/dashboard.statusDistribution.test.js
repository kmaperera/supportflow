const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");
const order = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "REOPENED"];

test("distribution scopes SQL, orders statuses and fills missing counts", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const result = await service.getTicketStatusDistribution({ id: "7", role }, { async query(sql, values) {
      const scope = role === "EMPLOYEE" ? " WHERE created_by = ?" : role === "TECHNICIAN" ? " WHERE assigned_to = ?" : "";
      assert.equal(sql, `SELECT status, COUNT(*) AS count FROM tickets${scope} GROUP BY status`);
      assert.deepEqual(values, role === "ADMIN" ? [] : ["7"]);
      return [[{ status: "CLOSED", count: "3" }, { status: "ASSIGNED", count: "2" }, { status: "OPEN", count: null }]];
    } });
    assert.deepEqual(result, order.map(status => ({ status, count: status === "CLOSED" ? 3 : status === "ASSIGNED" ? 2 : 0 })));
    assert.deepEqual(await service.getTicketStatusDistribution({ id: 7, role }, { async query() { return [[]]; } }), order.map(status => ({ status, count: 0 })));
  }
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  await assert.rejects(service.getTicketStatusDistribution(null, noQuery), { statusCode: 401 });
  await assert.rejects(service.getTicketStatusDistribution({ id: 7, role: "OTHER" }, noQuery), { statusCode: 403 });
  await assert.rejects(service.getTicketStatusDistribution({ id: 0, role: "EMPLOYEE" }, noQuery), { statusCode: 422 });
});

test("distribution endpoint rejects scope overrides and reflects current assignment", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "distribution-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "OTHER" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  const tickets = [{ owner: "1", assigned: "2", status: "ASSIGNED" }, { owner: "5", assigned: "6", status: "CLOSED" }];
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /^SELECT status, COUNT\(\*\) AS count FROM tickets/);
    const filtered = tickets.filter(ticket => sql.includes("created_by") ? ticket.owner === values[0]
      : sql.includes("assigned_to") ? ticket.assigned === values[0] : true);
    return [order.map(status => ({ status, count: String(filtered.filter(ticket => ticket.status === status).length) }))];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/status-distribution`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["dateFrom", "dateTo", "employeeId", "technicianId", "status", "role", "userId"]) assert.equal((await get(1, `?${key}=2`)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.message, "Ticket status distribution retrieved successfully");
    assert.deepEqual(body.data.distribution, order.map(status => ({ status, count: status === "ASSIGNED" || (actor === 3 && status === "CLOSED") ? 1 : 0 })));
  }
  tickets[0].assigned = "6";
  assert.ok((await (await get(2)).json()).data.distribution.every(item => item.count === 0));
});
