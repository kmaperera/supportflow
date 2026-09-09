const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReportQuery, dateBoundary, normalizeSlaReportQuery } = require("../src/modules/reports/reports.validation");
const repository = require("../src/modules/reports/reports.repository");
const service = require("../src/modules/reports/reports.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

const zero = { trackedTickets: 0, metTickets: 0, missedTickets: 0, pendingTickets: 0, completedTickets: 0, compliancePercentage: null };

test("SLA report binds supported filters and normalizes independent outcome aggregates", async () => {
  const { report } = await service.getSlaReport({ startDate: "2026-09-01", endDate: "2026-09-09", priorityId: "2", categoryId: "3", technicianId: "4" }, { async query(sql, values) {
    assert.deepEqual(values, ["2026-09-01 00:00:00", "2026-09-10 00:00:00", 2, 3, 4]);
    assert.match(sql, /FROM tickets AS t WHERE t.created_at >= \? AND t.created_at < \? AND t.priority_id = \? AND t.category_id = \? AND t.assigned_to = \?/);
    assert.doesNotMatch(sql, /JOIN|sla_policies|notifications|NOW|CURRENT_TIMESTAMP|GROUP BY|status/);
    for (const [dimension, due, completion] of [["response", "response_due_at", "first_response_at"], ["resolution", "resolution_due_at", "resolved_at"]]) {
      assert.ok(sql.includes(`COALESCE(SUM(t.${due} IS NOT NULL), 0) AS ${dimension}_tracked`));
      assert.ok(sql.includes(`COALESCE(SUM(t.${due} IS NOT NULL AND t.${completion} IS NULL), 0) AS ${dimension}_pending`));
      for (const [label, operator] of [["met", "<="], ["missed", ">"]]) assert.ok(sql.includes(`COALESCE(SUM(t.${due} IS NOT NULL AND t.${completion} IS NOT NULL AND t.${completion} ${operator} t.${due}), 0) AS ${dimension}_${label}`));
    }
    return [[{ response_tracked: "4", response_met: "2", response_missed: "1", response_pending: "1",
      resolution_tracked: "3", resolution_met: "0", resolution_missed: "1", resolution_pending: "2" }]];
  } });
  assert.deepEqual(report.responseSla, { trackedTickets: 4, metTickets: 2, missedTickets: 1, pendingTickets: 1, completedTickets: 3, compliancePercentage: 66.67 });
  assert.deepEqual(report.resolutionSla, { trackedTickets: 3, metTickets: 0, missedTickets: 1, pendingTickets: 2, completedTickets: 1, compliancePercentage: 0 });
  assert.equal(report.filters.technicianId, 4);
  for (const metrics of [report.responseSla, report.resolutionSla]) assert.equal(metrics.trackedTickets, metrics.completedTickets + metrics.pendingTickets);
  const empty = await service.getSlaReport({}, { async query() { return [[{}]]; } });
  assert.deepEqual(empty, { report: { filters: {}, responseSla: zero, resolutionSla: zero } });
  const pending = await service.getSlaReport({}, { async query() { return [[{ response_tracked: "2", response_pending: "2" }]]; } });
  assert.equal(pending.report.responseSla.compliancePercentage, null);
  for (const params of [{ status: "OPEN" }, { page: "1" }, { limit: "25" }, { sortBy: "status" }, { startDate: "2026-02-30" }, { priorityId: "0" }, { categoryId: "-1" }, { technicianId: "1.5" }, { startDate: "2026-09-10", endDate: "2026-09-01" }]) assert.throws(() => normalizeSlaReportQuery(params), { statusCode: 422 });
});

test("SLA report endpoint is ADMIN-only and rejects invalid query before repository access", async t => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "sla-report-test"; });
  t.after(() => variables.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN" }[id], is_active: 1 }));
  const query = t.mock.method(pool, "query", async () => [[{}]]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/reports/sla`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 2]) assert.equal((await get(actor)).status, 403);
  for (const suffix of ["?startDate=abc", "?endDate=2026-02-30", "?startDate=2026-09-10&endDate=2026-09-01", "?page=1", "?sortBy=name", "?technicianId=0"]) assert.equal((await get(3, suffix)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  for (const suffix of ["", "?startDate=2026-09-01", "?endDate=2026-09-09"]) {
    const response = await get(3, suffix);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.message, "SLA report retrieved successfully");
    assert.deepEqual(body.data.report.responseSla, zero);
    assert.deepEqual(body.data.report.resolutionSla, zero);
  }
  assert.equal(query.mock.callCount(), 3);
});
