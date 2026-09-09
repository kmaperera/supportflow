const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/reports/reports.service");

test("MySQL historical attribution excludes ambiguous/admin/missing events without current ownership fallback", { skip: process.env.RUN_REPORT_DB_TESTS !== "1" }, async () => {
  require("dotenv").config({ quiet: true });
  const mysql = require("mysql2/promise");
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  // Read-only CTE fixtures: no real tables or application data are modified.
  const fixtures = `fixture_users AS (
    SELECT 1 id, 'A' first_name, 'Tech' last_name, 'a@test' email, 0 is_active, 'TECHNICIAN' role
    UNION ALL SELECT 2, 'B', 'Tech', 'b@test', 1, 'TECHNICIAN'
    UNION ALL SELECT 3, 'Admin', 'User', 'admin@test', 1, 'ADMIN'
    UNION ALL SELECT 4, 'Zero', 'Tech', 'zero@test', 1, 'TECHNICIAN'
  ), fixture_tickets AS (
    SELECT 10 id, CAST('2026-09-01 00:00:00' AS DATETIME) created_at,
      CAST('2026-09-01 00:01:00' AS DATETIME) first_response_at, CAST('2026-09-01 00:10:00' AS DATETIME) resolved_at,
      CAST('2026-09-01 00:01:00' AS DATETIME) response_due_at, CAST('2026-09-01 00:09:00' AS DATETIME) resolution_due_at, 2 assigned_to
    UNION ALL SELECT 11, '2026-09-01', '2026-09-01 00:01:00', '2026-09-01 00:10:00', NULL, NULL, 2
    UNION ALL SELECT 12, '2026-09-01', '2026-09-01 00:01:00', NULL, NULL, NULL, 2
    UNION ALL SELECT 13, '2026-09-01', '2026-09-01 00:01:00', NULL, NULL, NULL, 2
    UNION ALL SELECT 14, '2026-09-01', NULL, NULL, NULL, NULL, 2
  ), fixture_ticket_assignments AS (
    SELECT 10 ticket_id, 1 technician_id UNION ALL SELECT 10, 1 UNION ALL SELECT 10, 2
  ), fixture_ticket_status_history AS (
    SELECT 10 ticket_id, 1 changed_by, CAST('2026-09-01 00:01:00' AS DATETIME) changed_at, 'ASSIGNED' from_status, 'IN_PROGRESS' to_status
    UNION ALL SELECT 10, 1, '2026-09-01 00:10:00', 'IN_PROGRESS', 'RESOLVED'
    UNION ALL SELECT 10, 1, '2026-09-01 00:10:00', 'IN_PROGRESS', 'RESOLVED'
    UNION ALL SELECT 11, 3, '2026-09-01 00:10:00', 'IN_PROGRESS', 'RESOLVED'
    UNION ALL SELECT 14, 1, '2026-09-01 00:10:00', 'IN_PROGRESS', 'RESOLVED'
  ), fixture_ticket_comments AS (
    SELECT 11 ticket_id, 3 user_id, CAST('2026-09-01 00:01:00' AS DATETIME) created_at, 'PUBLIC' comment_type
    UNION ALL SELECT 12, 1, '2026-09-01 00:01:00', 'PUBLIC'
    UNION ALL SELECT 12, 2, '2026-09-01 00:01:00', 'PUBLIC'
    UNION ALL SELECT 13, 1, '2026-09-01 00:01:01', 'PUBLIC'
    UNION ALL SELECT 10, 2, '2026-09-01 00:00:30', 'INTERNAL'
  )`;
  let calls = 0;
  const adapter = { async query(sql, params) {
    calls++;
    assert.doesNotMatch(sql, /assigned_to|sla_policies|ticket_feedback/);
    for (const table of ["ticket_status_history", "ticket_assignments", "ticket_comments", "tickets", "users"]) {
      sql = sql.replace(new RegExp(`\\b${table}\\b`, "g"), `fixture_${table}`);
    }
    sql = /^WITH /.test(sql) ? `WITH ${fixtures}, ${sql.slice(5)}` : `WITH ${fixtures} ${sql}`;
    return db.query(sql, params);
  } };
  try {
    const { report } = await service.getTechnicianPerformanceReport({}, adapter);
    assert.equal(calls, 5);
    const a = report.technicians.find(row => row.technicianId === 1);
    assert.equal(a.assignedTickets, 1);
    assert.equal(a.resolvedTickets, 2);
    assert.equal(a.firstResponseSamples, 1);
    assert.equal(a.resolutionSamples, 1);
    assert.equal(a.averageFirstResponseMinutes, 1);
    assert.equal(a.averageResolutionMinutes, 10);
    assert.equal(a.responseSlaCompliancePercentage, 100);
    assert.equal(a.resolutionSlaCompliancePercentage, 0);
    assert.equal(a.isActive, false);
    const b = report.technicians.find(row => row.technicianId === 2);
    assert.equal(b.assignedTickets, 1);
    assert.equal(b.resolvedTickets, 0);
    assert.equal(b.firstResponseSamples, 0);
    assert.equal(b.averageResolutionMinutes, null);
    assert.equal(report.technicians.length, 3);
    const empty = await service.getTechnicianPerformanceReport({ startDate: "2026-09-02" }, adapter);
    assert.ok(empty.report.technicians.every(row => row.assignedTickets === 0 && row.resolvedTickets === 0 && row.firstResponseSamples === 0));
  } finally { await db.end(); }
});
