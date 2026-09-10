const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReportQuery, dateBoundary } = require("../src/modules/reports/reports.validation");
const repository = require("../src/modules/reports/reports.repository");
const service = require("../src/modules/reports/reports.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("report filters validate real UTC dates, selectable filters and safe pagination", () => {
  assert.equal(dateBoundary("2024-02-29", true), "2024-03-01 00:00:00");
  assert.equal(dateBoundary("2026-12-31", true), "2027-01-01 00:00:00");
  assert.equal(dateBoundary("2026-09-09"), "2026-09-09 00:00:00");
  assert.deepEqual(normalizeReportQuery(), { filters: {}, pagination: { page: 1, limit: 25, offset: 0 } });
  assert.deepEqual(normalizeReportQuery({ technicianId: "7", page: "2", limit: "100" }), { filters: { technicianId: 7 }, pagination: { page: 2, limit: 100, offset: 100 } });
  for (const value of ["2026-02-30", "2026-13-01", "2026-00-01", "2026-01-00", "2026-2-01", "abc", "2025-02-29", ["2026-09-01"]]) {
    assert.throws(() => normalizeReportQuery({ startDate: value }), { statusCode: 422 });
  }
  for (const input of [{ startDate: "2026-09-10", endDate: "2026-09-09" }, { endDate: "9999-12-31" }, { status: "INVALID" }, { priorityId: "0" }, { categoryId: "-1" }, { technicianId: "1.5" }, { technicianId: "x" }, { page: "9007199254740991", limit: "100" }, { limit: "101" }, { limit: "0" }, { page: "0" }, { page: [] }, { sortBy: "status" }]) {
    assert.throws(() => normalizeReportQuery(input), { statusCode: 422 });
  }
  assert.throws(() => normalizeReportQuery({ status: "OPEN" }, ["startDate"]), { statusCode: 422 });
  assert.deepEqual(normalizeReportQuery({ startDate: "2026-09-01" }, ["startDate"]).filters, { startDate: "2026-09-01" });
});

test("report rows/count share bound predicates and return lightweight numeric metadata", async () => {
  const calls = [];
  const row = { id: "7", ticket_number: "SF-7", title: "Printer", status: "CLOSED", category_id: "3", category_name: "Hardware",
    priority_id: "2", priority_name: "High", created_by: "1", requester_first_name: " Alice ", requester_last_name: " User ", requester_email: "alice@example.test", assigned_to: null,
    created_at: "created", first_response_at: null, resolved_at: "resolved", response_due_at: null, resolution_due_at: null };
  const db = { async query(sql, values) {
    calls.push({ sql, values });
    assert.doesNotMatch(sql, /SELECT \*|description|comments|attachments|notifications|history|password/);
    return sql.includes("COUNT(*)") ? [[{ total: "26" }]] : [[row]];
  } };
  const result = await service.getTicketReportQuery({ startDate: "2026-09-01", endDate: "2026-09-09", status: "CLOSED", priorityId: "2", categoryId: "3", technicianId: "4", page: "2" }, db);
  const where = " WHERE t.created_at >= ? AND t.created_at < ? AND t.status = ? AND t.priority_id = ? AND t.category_id = ? AND t.assigned_to = ?";
  assert.ok(calls.every(call => call.sql.includes(where)));
  assert.deepEqual(calls[1].values, ["2026-09-01 00:00:00", "2026-09-10 00:00:00", "CLOSED", 2, 3, 4]);
  assert.deepEqual(calls[0].values, [...calls[1].values, 25, 25]);
  assert.match(calls[0].sql, /ORDER BY t.created_at DESC, t.id DESC LIMIT \? OFFSET \?/);
  assert.deepEqual(result.report.pagination, { page: 2, limit: 25, totalItems: 26, totalPages: 2 });
  assert.deepEqual(result.report.rows[0].requester, { id: 1, name: "Alice User", email: "alice@example.test" });
  assert.equal(result.report.rows[0].assignedTechnician, null);
  assert.equal(result.report.rows[0].id, 7);
  assert.equal(result.report.filters.technicianId, 4);
  assert.ok(!JSON.stringify(result).includes("whereSql"));
  assert.deepEqual(await service.getTicketReportQuery({}, { async query(sql) { return sql.includes("COUNT(*)") ? [[{ total: "0" }]] : [[]]; } }),
    { report: { filters: {}, sorting: { sortBy: "createdAt", sortOrder: "DESC" }, pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 0 }, rows: [] } });
  const injection = "OPEN' OR 1=1 --";
  const built = repository.buildTicketReportWhere({ status: injection });
  assert.equal(built.whereSql, " WHERE t.status = ?");
  assert.deepEqual(built.params, [injection]);
});

test("report endpoint is ADMIN-only and rejects invalid query before repository access", async t => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "report-test"; });
  t.after(() => variables.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN" }[id], is_active: 1 }));
  const query = t.mock.method(pool, "query", async sql => sql.includes("COUNT(*)") ? [[{ total: "0" }]] : [[]]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/reports/tickets`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 2]) assert.equal((await get(actor)).status, 403);
  for (const suffix of ["?startDate=2026-02-30", "?startDate=2026-09-10&endDate=2026-09-01", "?status=OTHER", "?page=0", "?limit=101", "?priorityId=0", "?categoryId=-1", "?technicianId=1.5", "?sortBy=id", "?userId=1", "?status=OPEN&status=CLOSED"]) {
    assert.equal((await get(3, suffix)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  const response = await get(3);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Ticket report retrieved successfully", data: {
    report: { filters: {}, sorting: { sortBy: "createdAt", sortOrder: "DESC" }, pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 0 }, rows: [] } } });
  assert.equal(query.mock.callCount(), 2);
  const searched = await get(3, "?search=%25wifi&sortBy=technician&sortOrder=asc&page=5");
  assert.equal(searched.status, 200);
  const searchedReport = (await searched.json()).data.report;
  assert.equal(searchedReport.filters.search, "%wifi");
  assert.deepEqual(searchedReport.sorting, { sortBy: "technician", sortOrder: "ASC" });
  assert.equal(searchedReport.pagination.page, 5);
  assert.deepEqual(searchedReport.rows, []);
  t.mock.method(pool, "query", async () => { throw new Error("sensitive SQL detail"); });
  const failure = await get(3);
  assert.equal(failure.status, 500);
  assert.equal((await failure.json()).message, "Internal server error");
});


test("final ticket report maps current technician emails and preserves nullable timestamps", async () => {
  const row = { id: "8", ticket_number: "SF-8", title: "Printer", status: "OPEN", category_id: "3", category_name: "Inactive category",
    priority_id: "2", priority_name: "HIGH", created_by: "1", requester_first_name: " Alice ", requester_last_name: " User ", requester_email: "alice@example.test",
    assigned_to: "4", technician_first_name: " Bob ", technician_last_name: " Tech ", technician_email: "bob@example.test",
    created_at: "2026-09-01T00:00:00.000Z", first_response_at: null, resolved_at: null, response_due_at: null, resolution_due_at: null };
  const result = await service.getTicketReportQuery({ technicianId: "4", limit: "1" }, { async query(sql, values) {
    assert.doesNotMatch(sql, /ticket_assignments|ticket_comments|ticket_status_history|ticket_attachments|notifications|sla_policies|knowledge_base|is_active|password|refresh|feedback/);
    if (sql.includes("COUNT(*)")) {
      assert.doesNotMatch(sql, /JOIN/);
      assert.deepEqual(values, [4]);
      return [[{ total: "2" }]];
    }
    assert.match(sql, /requester.email AS requester_email/);
    assert.match(sql, /technician.email AS technician_email/);
    assert.match(sql, /LEFT JOIN users AS technician ON technician.id = t.assigned_to/);
    assert.match(sql, /INNER JOIN users AS requester ON requester.id = t.created_by/);
    assert.match(sql, /INNER JOIN ticket_categories AS c ON c.id = t.category_id/);
    assert.match(sql, /INNER JOIN ticket_priorities AS p ON p.id = t.priority_id/);
    assert.deepEqual(values, [4, 1, 0]);
    return [[row]];
  } });
  assert.deepEqual(result.report.rows, [{ id: 8, ticketNumber: "SF-8", title: "Printer", status: "OPEN",
    category: { id: 3, name: "Inactive category" }, priority: { id: 2, name: "HIGH" },
    requester: { id: 1, name: "Alice User", email: "alice@example.test" },
    assignedTechnician: { id: 4, name: "Bob Tech", email: "bob@example.test" },
    createdAt: "2026-09-01T00:00:00.000Z", firstResponseAt: null, resolvedAt: null, responseDueAt: null, resolutionDueAt: null }]);
  assert.deepEqual(result.report.pagination, { page: 1, limit: 1, totalItems: 2, totalPages: 2 });
});
