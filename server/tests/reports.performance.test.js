const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReportQuery, dateBoundary, normalizePerformanceQuery } = require("../src/modules/reports/reports.validation");
const repository = require("../src/modules/reports/reports.repository");
const service = require("../src/modules/reports/reports.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("performance merges grouped historical metrics, retains inactive/empty technicians and sorts", async t => {
  t.mock.method(repository, "getPerformanceTechnicians", async () => [
    { id: "2", first_name: "Zero", last_name: "Tech", email: "zero@test", is_active: 1 },
    { id: "1", first_name: " Alice ", last_name: " Tech ", email: "alice@test", is_active: 0 }]);
  t.mock.method(repository, "getTechnicianHistoricalCounts", async (filters, kind) => {
    assert.deepEqual(filters, { startAt: "2026-09-01 00:00:00", endExclusive: "2026-09-10 00:00:00" });
    return [{ technician_id: "1", ticket_count: kind === "assignment" ? "3" : "2" }];
  });
  t.mock.method(repository, "getTechnicianCompletionMetrics", async (filters, kind) => [{ technician_id: "1", samples: "3", average_seconds: "61", sla_met: "2", sla_missed: "1" }]);
  const { report } = await service.getTechnicianPerformanceReport({ startDate: "2026-09-01", endDate: "2026-09-09" }, {});
  assert.equal(report.technicians[0].technicianId, 1);
  assert.equal(report.technicians[0].isActive, false);
  assert.equal(report.technicians[0].technicianName, "Alice Tech");
  assert.equal(report.technicians[0].assignedTickets, 3);
  assert.equal(report.technicians[0].resolvedTickets, 2);
  assert.equal(report.technicians[0].averageFirstResponseMinutes, 1.02);
  assert.equal(report.technicians[0].responseSlaCompliancePercentage, 66.67);
  assert.equal(report.technicians[1].assignedTickets, 0);
  assert.equal(report.technicians[1].averageResolutionMinutes, null);
  assert.equal(report.technicians[1].resolutionSlaCompliancePercentage, null);
  assert.deepEqual(normalizePerformanceQuery({}), {});
  for (const params of [{ page: "1" }, { sortBy: "name" }, { technicianId: "1" }, { startDate: "2026-02-30" }, { startDate: "2026-09-10", endDate: "2026-09-01" }]) {
    assert.throws(() => normalizePerformanceQuery(params), { statusCode: 422 });
  }
});

test("technician performance endpoint is ADMIN-only and rejects invalid query before repository access", async t => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "performance-test"; });
  t.after(() => variables.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN" }[id], is_active: 1 }));
  const query = t.mock.method(pool, "query", async () => [[]]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/reports/technician-performance`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 2]) assert.equal((await get(actor)).status, 403);
  for (const suffix of ["?startDate=abc", "?endDate=2026-02-30", "?startDate=2026-09-10&endDate=2026-09-01", "?page=1", "?sortBy=name", "?technicianId=1"]) assert.equal((await get(3, suffix)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  for (const suffix of ["", "?startDate=2026-09-01", "?endDate=2026-09-09"]) {
    const response = await get(3, suffix);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.message, "Technician performance report retrieved successfully");
    assert.deepEqual(body.data.report.technicians, []);
  }
  assert.equal(query.mock.callCount(), 15);
});
