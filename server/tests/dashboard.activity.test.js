const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

const repository = require("../src/modules/dashboard/dashboard.repository");
function fixtureDatabase() {
  const events = ["status", "assignment", "assignmentEnd", "comment", "comment"].map((source, i) => ({ source,
    event_id: String(i + 1), ticket_id: "7", ticket_number: "SF-7", ticket_title: "Printer",
    created_at: new Date(`2026-09-09T12:00:0${i}Z`), actor_id: source === "assignmentEnd" ? null : "9",
    actor_first_name: " Alice ", actor_last_name: " Tech ", from_status: "ASSIGNED", to_status: "IN_PROGRESS",
    technician_id: "2", assignment_type: "ADMIN", comment_type: i === 4 ? "INTERNAL" : "PUBLIC" }));
  let assigned = "2";
  return { events, reassign() { assigned = "6"; }, async query(sql, values) {
    assert.match(sql, /INNER JOIN tickets AS t ON t.id = e.ticket_id/);
    assert.match(sql, /ORDER BY e\.(changed_at|assigned_at|unassigned_at|created_at) DESC, e.id DESC LIMIT \?$/);
    assert.doesNotMatch(sql, /notifications|content|password|email|token|UPDATE|INSERT|DELETE/);
    const source = sql.includes("ticket_status_history") ? "status" : sql.includes("ticket_comments") ? "comment"
      : sql.includes("e.unassigned_at AS created_at") ? "assignmentEnd" : "assignment";
    if (source === "assignmentEnd") assert.match(sql, /e.unassigned_at IS NOT NULL/);
    if (source === "status") assert.match(sql, /e.from_status <> e.to_status/);
    const visible = sql.includes("t.created_by = ?") ? values[0] === "1" : sql.includes("t.assigned_to = ?") ? values[0] === assigned : true;
    return [visible ? events.filter(row => row.source === source && (!sql.includes("e.comment_type = ?") || row.comment_type === "PUBLIC"))
      .sort((a, b) => b.created_at - a.created_at || Number(b.event_id) - Number(a.event_id)).slice(0, values.at(-1)) : []];
  } };
}

test("activity queries bind each scope, hide employee internal notes and merge chronologically", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    const db = fixtureDatabase();
    let calls = 0;
    const id = role === "TECHNICIAN" ? "2" : "1";
    const activities = await service.getRecentTicketActivity({ id, role }, undefined, { async query(sql, values) {
      calls++;
      const comment = sql.includes("ticket_comments");
      assert.deepEqual(values, [...(role === "ADMIN" ? [] : [id]), ...(comment && role === "EMPLOYEE" ? ["PUBLIC"] : []), 10]);
      if (role !== "ADMIN") assert.ok(sql.includes(role === "EMPLOYEE" ? "t.created_by = ?" : "t.assigned_to = ?"));
      return db.query(sql, values);
    } });
    assert.equal(calls, 4);
    assert.deepEqual(activities.map(row => row.type), [...(role === "EMPLOYEE" ? [] : ["INTERNAL_NOTE"]), "PUBLIC_COMMENT", "ASSIGNMENT_ENDED", "ASSIGNED", "STATUS_CHANGED"]);
    assert.equal(activities.find(row => row.type === "ASSIGNMENT_ENDED").actor, null);
    assert.deepEqual(activities.at(-1), { type: "STATUS_CHANGED", ticketId: 7, ticketNumber: "SF-7", ticketTitle: "Printer",
      message: "Ticket status changed from ASSIGNED to IN_PROGRESS", actor: { id: 9, name: "Alice Tech" },
      createdAt: new Date("2026-09-09T12:00:00Z"), oldStatus: "ASSIGNED", newStatus: "IN_PROGRESS" });
    assert.equal((await service.getRecentTicketActivity({ id, role }, 1, db)).length, 1);
  }
});

test("activity handles ties, empty scopes, invalid limits and defensive comment visibility", async (t) => {
  const db = fixtureDatabase();
  db.events.forEach(row => { row.created_at = new Date("2026-09-09T00:00:00Z"); });
  assert.deepEqual((await service.getRecentTicketActivity({ id: 3, role: "ADMIN" }, 20, db)).map(row => row.type),
    ["STATUS_CHANGED", "ASSIGNED", "ASSIGNMENT_ENDED", "INTERNAL_NOTE", "PUBLIC_COMMENT"]);
  db.events.length = 0;
  assert.deepEqual(await service.getRecentTicketActivity({ id: 3, role: "ADMIN" }, 20, db), []);
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  for (const limit of [0, -1, 1.5, 21, "abc", "", null, ["1"], {}, "1 OR 1=1"]) {
    await assert.rejects(service.getRecentTicketActivity({ id: 3, role: "ADMIN" }, limit, noQuery), { statusCode: 422 });
  }
  await assert.rejects(service.getRecentTicketActivity(null, 10, noQuery), { statusCode: 401 });
  await assert.rejects(service.getRecentTicketActivity({ id: 3, role: "OTHER" }, 10, noQuery), { statusCode: 403 });
  t.mock.method(repository, "getRecentActivitySource", async source => source === "comment" ? [{ comment_type: "INTERNAL" }] : []);
  assert.deepEqual(await service.getRecentTicketActivity({ id: 1, role: "EMPLOYEE" }), []);
});

test("recent activity endpoint authenticates, rejects overrides and follows current assignment", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "recent-activity-test"; });
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
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/recent-activity`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["userId", "employeeId", "technicianId", "role", "dateFrom", "dateTo", "month", "year"]) {
    assert.equal((await get(1, `?${key}=3`)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const suffix of ["?limit=0", "?limit=-1", "?limit=1.5", "?limit=abc", "?limit=21", "?limit=", "?limit=1&limit=2", "?limit[]=1"]) {
    assert.equal((await get(3, suffix)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.message, "Recent ticket activity retrieved successfully");
    assert.deepEqual(Object.keys(body.data), ["activities"]);
    assert.equal(body.data.activities.length, actor === 1 ? 4 : 5);
    if (actor === 1) assert.ok(body.data.activities.every(row => row.type !== "INTERNAL_NOTE"));
  }
  assert.equal((await (await get(3, "?limit=1")).json()).data.activities.length, 1);
  assert.equal((await get(3, "?limit=20")).status, 200);
  db.reassign();
  assert.deepEqual((await (await get(2)).json()).data, { activities: [] });
  assert.equal((await (await get(6)).json()).data.activities.length, 5);
  db.events.length = 0;
  const empty = await get(1);
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).data, { activities: [] });
});
