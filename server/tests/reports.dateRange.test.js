const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReportQuery, dateBoundary, normalizeDateRangeQuery } = require("../src/modules/reports/reports.validation");
const repository = require("../src/modules/reports/reports.repository");
const service = require("../src/modules/reports/reports.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("date-range reuses strict required date validation and rejects all unrelated filters", () => {
  for (const params of [{}, { startDate: "2026-09-01" }, { endDate: "2026-09-09" }, { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-13-01", endDate: "2026-03-01" }, { startDate: "abc", endDate: "2026-03-01" }, { startDate: "2026-09-10", endDate: "2026-09-09" }]) {
    assert.throws(() => normalizeDateRangeQuery(params), { statusCode: 422 });
  }
  for (const key of ["page", "limit", "status", "categoryId", "priorityId", "technicianId", "search", "sort"]) {
    assert.throws(() => normalizeDateRangeQuery({ startDate: "2026-09-01", endDate: "2026-09-09", [key]: "1" }), { statusCode: 422 });
  }
});

test("date-range uses one bounded creation aggregate and zero-fills UTC dates with consistent totals", async () => {
  let calls = 0;
  const result = await service.getDateRangeReport({ startDate: "2026-09-01", endDate: "2026-09-03" }, { async query(sql, values) {
    calls++;
    assert.match(sql, /DATE_FORMAT\(t.created_at, '%Y-%m-%d'\) AS report_date, COUNT\(\*\) AS ticket_count/);
    assert.match(sql, /WHERE t.created_at >= \? AND t.created_at < \?/);
    assert.match(sql, /GROUP BY report_date ORDER BY report_date ASC/);
    assert.doesNotMatch(sql, /JOIN|status|updated_at|resolved_at|first_response_at|LIMIT|OFFSET/);
    assert.deepEqual(values, ["2026-09-01 00:00:00", "2026-09-04 00:00:00"]);
    return [[{ report_date: "2026-09-03", ticket_count: "2" }, { report_date: "2026-09-01", ticket_count: "3" }]];
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { report: { range: { startDate: "2026-09-01", endDate: "2026-09-03" }, totalTickets: 5,
    dailyBreakdown: [{ date: "2026-09-01", ticketCount: 3 }, { date: "2026-09-02", ticketCount: 0 }, { date: "2026-09-03", ticketCount: 2 }] } });
  const empty = { async query() { return [[]]; } };
  for (const [startDate, endDate, dates] of [["2026-09-09", "2026-09-09", ["2026-09-09"]],
    ["2024-02-28", "2024-03-01", ["2024-02-28", "2024-02-29", "2024-03-01"]],
    ["2026-12-31", "2027-01-01", ["2026-12-31", "2027-01-01"]]]) {
    const { report } = await service.getDateRangeReport({ startDate, endDate }, empty);
    assert.equal(report.totalTickets, 0);
    assert.deepEqual(report.dailyBreakdown, dates.map(date => ({ date, ticketCount: 0 })));
  }
});

test("date-range endpoint is ADMIN-only and rejects invalid query before repository access", async t => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "date-range-test"; });
  t.after(() => variables.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN" }[id], is_active: 1 }));
  const query = t.mock.method(pool, "query", async () => [[]]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/reports/date-range`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 2]) assert.equal((await get(actor)).status, 403);
  for (const suffix of ["", "?startDate=2026-09-01", "?endDate=2026-09-09", "?startDate=2026-02-30&endDate=2026-03-01", "?startDate=2026-13-01&endDate=2026-09-09", "?startDate=abc&endDate=2026-09-09", "?startDate=2026-09-10&endDate=2026-09-09", "?startDate=2026-09-09&endDate=2026-09-09&page=1"]) {
    assert.equal((await get(3, suffix)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  const response = await get(3, "?startDate=2026-09-09&endDate=2026-09-09");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Date-range report retrieved successfully", data: {
    report: { range: { startDate: "2026-09-09", endDate: "2026-09-09" }, totalTickets: 0, dailyBreakdown: [{ date: "2026-09-09", ticketCount: 0 }] } } });
  assert.equal(query.mock.callCount(), 1);
});
