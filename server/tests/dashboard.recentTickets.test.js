const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

const statuses = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "REOPENED"];
function fixtureDatabase() {
  const tickets = Array.from({ length: 14 }, (_, i) => ({ id: String(i + 1), ticket_number: `SF-${i + 1}`,
    title: `Ticket ${i + 1}`, status: statuses[i % statuses.length], created_at: new Date(i < 7 ? "2026-09-01T00:00:00Z" : "2026-09-02T00:00:00Z"),
    priority_id: "2", priority_name: "HIGH", category_id: "3", category_name: "Hardware", owner: i % 2 ? "1" : "5", assigned: i % 2 ? "2" : "6",
    description: "private detail" }));
  return { tickets, async query(sql, values) {
    assert.match(sql, /ORDER BY t.created_at DESC, t.id DESC LIMIT \?$/);
    assert.match(sql, /INNER JOIN ticket_categories AS c ON c.id = t.category_id/);
    assert.match(sql, /INNER JOIN ticket_priorities AS p ON p.id = t.priority_id/);
    assert.doesNotMatch(sql, /description|password|token|updated_at|history|ticket_assignments|comments|attachments|sla|UPDATE|INSERT|DELETE/);
    const scoped = tickets.filter(ticket => sql.includes("t.created_by = ?") ? ticket.owner === values[0]
      : sql.includes("t.assigned_to = ?") ? ticket.assigned === values[0] : true);
    return [scoped.sort((a, b) => b.created_at - a.created_at || Number(b.id) - Number(a.id)).slice(0, values.at(-1))];
  } };
}

test("recent tickets use parameterized scopes and limits and map a lightweight ordered preview", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const id = role === "TECHNICIAN" ? "2" : "1";
    const db = fixtureDatabase();
    const rows = await service.getRecentTickets({ id, role }, "10", { async query(sql, values) {
      assert.deepEqual(values, role === "ADMIN" ? [10] : [id, 10]);
      if (role === "ADMIN") assert.doesNotMatch(sql, /WHERE/);
      else assert.ok(sql.includes(role === "EMPLOYEE" ? "WHERE t.created_by = ?" : "WHERE t.assigned_to = ?"));
      return db.query(sql, values);
    } });
    assert.equal(rows.length, role === "ADMIN" ? 10 : 7);
    assert.deepEqual(rows[0], { id: 14, ticketNumber: "SF-14", title: "Ticket 14", status: "REOPENED",
      createdAt: new Date("2026-09-02T00:00:00Z"), priority: { id: 2, name: "HIGH" }, category: { id: 3, name: "Hardware" } });
    assert.ok(rows.every((row, index) => index === 0 || rows[index - 1].createdAt >= row.createdAt));
    if (role !== "ADMIN") assert.deepEqual(new Set(rows.map(row => row.status)), new Set(statuses));
  }
});

test("recent ticket limits default to five and reject invalid values before SQL", async () => {
  const user = { id: "1", role: "ADMIN" };
  assert.equal((await service.getRecentTickets(user, undefined, fixtureDatabase())).length, 5);
  assert.equal((await service.getRecentTickets(user, 1, fixtureDatabase())).length, 1);
  const db = fixtureDatabase();
  db.tickets.length = 0;
  assert.deepEqual(await service.getRecentTickets(user, 5, db), []);
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  for (const limit of [0, -1, 1.5, 11, "abc", "", "1.0", "1e1", "1 OR 1=1", ["1"], {}, null, true]) {
    await assert.rejects(service.getRecentTickets(user, limit, noQuery), { statusCode: 422 });
  }
  await assert.rejects(service.getRecentTickets(null, 5, noQuery), { statusCode: 401 });
  await assert.rejects(service.getRecentTickets({ id: 1, role: "OTHER" }, 5, noQuery), { statusCode: 403 });
  await assert.rejects(service.getRecentTickets({ id: "1 OR 1=1", role: "EMPLOYEE" }, 5, noQuery), { statusCode: 422 });
});

test("recent tickets endpoint authenticates, rejects overrides and follows current assignment", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "recent-tickets-test"; });
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
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/recent-tickets`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["userId", "employeeId", "technicianId", "role", "dateFrom", "dateTo", "month", "year"]) {
    assert.equal((await get(1, `?${key}=3`)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const suffix of ["?limit=0", "?limit=-1", "?limit=1.5", "?limit=abc", "?limit=11", "?limit=", "?limit=1&limit=2", "?limit[]=1"]) {
    assert.equal((await get(3, suffix)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.message, "Recent tickets retrieved successfully");
    assert.deepEqual(Object.keys(body.data), ["tickets"]);
    assert.equal(body.data.tickets.length, 5);
    assert.deepEqual(body.data.tickets.map(ticket => ticket.id), actor === 3 ? [14, 13, 12, 11, 10] : [14, 12, 10, 8, 6]);
  }
  assert.equal((await (await get(3, "?limit=1")).json()).data.tickets.length, 1);
  assert.equal((await (await get(3, "?limit=10")).json()).data.tickets.length, 10);
  db.tickets.forEach(ticket => { ticket.assigned = "6"; });
  const response = await get(2);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { tickets: [] });
  assert.deepEqual((await (await get(6)).json()).data.tickets.map(ticket => ticket.id), [14, 13, 12, 11, 10]);
});
