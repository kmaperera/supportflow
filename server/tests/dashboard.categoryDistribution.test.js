const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("category query scopes current tickets, retains inactive categories and maps numeric summaries", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const result = await service.getTicketCategoryDistribution({ id: "7", role }, { async query(sql, values) {
      assert.match(sql, /INNER JOIN ticket_categories AS c ON c.id = t.category_id/);
      assert.match(sql, /GROUP BY c.id, c.name ORDER BY count DESC, c.name ASC/);
      assert.doesNotMatch(sql, /is_active|knowledge_base|ticket_assignments|UPDATE|INSERT/);
      if (role === "ADMIN") { assert.doesNotMatch(sql, /WHERE/); assert.deepEqual(values, []); }
      else { assert.ok(sql.includes(role === "EMPLOYEE" ? "WHERE t.created_by = ?" : "WHERE t.assigned_to = ?")); assert.deepEqual(values, ["7"]); }
      return [[{ category_id: "2", category_name: "Hardware", count: "3" }, { category_id: "1", category_name: "Network", count: "1" }]];
    } });
    assert.deepEqual(result, [{ categoryId: 2, categoryName: "Hardware", count: 3 }, { categoryId: 1, categoryName: "Network", count: 1 }]);
    assert.deepEqual(await service.getTicketCategoryDistribution({ id: 7, role }, { async query() { return [[]]; } }), []);
  }
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  await assert.rejects(service.getTicketCategoryDistribution(null, noQuery), { statusCode: 401 });
  await assert.rejects(service.getTicketCategoryDistribution({ id: 7, role: "UNKNOWN" }, noQuery), { statusCode: 403 });
  await assert.rejects(service.getTicketCategoryDistribution({ id: 0, role: "EMPLOYEE" }, noQuery), { statusCode: 422 });
});

test("category distribution endpoint authenticates and rejects client scope overrides", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "category-distribution-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "UNKNOWN" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  const tickets = [{ owner: "1", assigned: "2", category: "Hardware" }, { owner: "5", assigned: "6", category: "Network" }];
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /^SELECT /);
    const visible = tickets.filter(ticket => sql.includes("t.created_by") ? ticket.owner === values[0] : sql.includes("t.assigned_to") ? ticket.assigned === values[0] : true);
    return [visible.map(ticket => ({ category_id: ticket.category === "Hardware" ? "1" : "2", category_name: ticket.category, count: "1" }))];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/category-distribution`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["categoryId", "employeeId", "technicianId", "dateFrom", "dateTo", "role"]) assert.equal((await get(1, `?${key}=2`)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.message, "Ticket category distribution retrieved successfully");
    assert.deepEqual(result.data.distribution, actor === 3 ? [{ categoryId: 1, categoryName: "Hardware", count: 1 }, { categoryId: 2, categoryName: "Network", count: 1 }] : [{ categoryId: 1, categoryName: "Hardware", count: 1 }]);
  }
  tickets[0].assigned = "6";
  assert.deepEqual((await (await get(2)).json()).data.distribution, []);
});
