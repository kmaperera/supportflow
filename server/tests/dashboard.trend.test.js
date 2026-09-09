const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

const now = new Date("2026-09-09T23:59:59Z");

test("trend queries creation buckets with half-open UTC ranges and authenticated scopes", async () => {
  for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
    for (const period of ["daily", "monthly"]) {
      const daily = period === "daily";
      const result = await service.getTicketTrend({ id: "7", role }, period, { async query(sql, values) {
        assert.match(sql, /COUNT\(\*\) AS ticket_count/);
        assert.ok(sql.includes(`DATE_FORMAT(created_at, '${daily ? "%Y-%m-%d" : "%Y-%m"}') AS period_key`));
        assert.match(sql, /WHERE created_at >= \? AND created_at < \?/);
        assert.match(sql, /GROUP BY period_key ORDER BY period_key ASC/);
        assert.doesNotMatch(sql, /updated_at|resolved_at|first_response_at|ticket_status_history|ticket_assignments|JOIN|UPDATE|INSERT|DELETE/);
        assert.ok(sql.includes(role === "EMPLOYEE" ? "AND created_by = ?" : role === "TECHNICIAN" ? "AND assigned_to = ?" : "FROM tickets"));
        assert.deepEqual(values, [daily ? "2026-08-11 00:00:00" : "2025-10-01 00:00:00",
          daily ? "2026-09-10 00:00:00" : "2026-10-01 00:00:00", ...(role === "ADMIN" ? [] : ["7"])]);
        return [[{ period_key: daily ? "2026-09-09" : "2026-09", ticket_count: "3" },
          { period_key: daily ? "2026-08-11" : "2025-10", ticket_count: "2" }]];
      } }, now);
      assert.equal(result.period, period);
      assert.equal(result.trend.length, daily ? 30 : 12);
      assert.deepEqual(result.trend[0], { [daily ? "date" : "month"]: daily ? "2026-08-11" : "2025-10", count: 2 });
      assert.equal(result.trend.at(-1).count, 3);
      assert.ok(result.trend.slice(1, -1).every(row => row.count === 0));
      assert.ok(result.trend.every(row => Number.isInteger(row.count)));
    }
  }
});

test("trend handles leap days, year boundaries, defaults, empty data and invalid input", async () => {
  const db = { async query() { return [[]]; } };
  const user = { id: 1, role: "ADMIN" };
  const leap = await service.getTicketTrend(user, "daily", db, new Date("2024-03-01T00:00:00Z"));
  assert.equal(leap.trend[0].date, "2024-02-01");
  assert.equal(leap.trend[28].date, "2024-02-29");
  assert.equal(leap.trend[29].date, "2024-03-01");
  const monthly = await service.getTicketTrend(user, undefined, db, new Date("2026-01-01T00:00:00Z"));
  assert.equal(monthly.period, "monthly");
  assert.equal(monthly.trend[0].month, "2025-02");
  assert.equal(monthly.trend.at(-1).month, "2026-01");
  assert.ok(monthly.trend.every(row => row.count === 0));
  const daily = await service.getTicketTrend(user, "daily", db, new Date("2026-01-01T00:00:00Z"));
  assert.equal(daily.trend[0].date, "2025-12-03");
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  for (const period of ["", "DAILY", "weekly", null, ["daily"], {}]) {
    await assert.rejects(service.getTicketTrend(user, period, noQuery), { statusCode: 422 });
  }
  await assert.rejects(service.getTicketTrend(null, "daily", noQuery), { statusCode: 401 });
  await assert.rejects(service.getTicketTrend({ id: 1, role: "OTHER" }, "daily", noQuery), { statusCode: 403 });
});

test("trend endpoint authenticates, rejects overrides and follows current assignment", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "trend-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "OTHER", 6: "TECHNICIAN" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  let assigned = "2";
  const query = t.mock.method(pool, "query", async (sql, values) => {
    const included = sql.includes("created_by = ?") ? values[2] === "1"
      : sql.includes("assigned_to = ?") ? values[2] === assigned : true;
    // Creation stays in its original bucket even after reassignment.
    return [included ? [{ period_key: values[0].slice(0, sql.includes("%Y-%m-%d") ? 10 : 7), ticket_count: "1" }] : []];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/ticket-trend`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(4)).status, 403);
  for (const key of ["userId", "employeeId", "technicianId", "role", "dateFrom", "dateTo", "month", "year"]) {
    assert.equal((await get(1, `?${key}=3`)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const suffix of ["?period=weekly", "?period=", "?period=DAILY", "?period=daily&period=monthly", "?period[]=daily"]) {
    assert.equal((await get(3, suffix)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    for (const period of ["daily", "monthly"]) {
      const response = await get(actor, `?period=${period}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.message, "Ticket trend retrieved successfully");
      assert.equal(body.data.period, period);
      assert.equal(body.data.trend.length, period === "daily" ? 30 : 12);
      assert.equal(body.data.trend[0].count, 1);
      assert.ok(body.data.trend.slice(1).every(row => row.count === 0));
    }
  }
  assert.equal((await (await get(3)).json()).data.period, "monthly");
  assigned = "6";
  assert.ok((await (await get(2)).json()).data.trend.every(row => row.count === 0));
  assert.equal((await (await get(6)).json()).data.trend[0].count, 1);
});
