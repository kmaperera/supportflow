const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });
const pool = require("../../src/config/database");
const dashboard = require("../../src/modules/dashboard/dashboard.repository");
const feedback = require("../../src/modules/ticketFeedback/ticketFeedback.repository");

async function main() {
  const report = { indexes: {}, plans: {} };
  try {
    for (const table of ["tickets", "users", "ticket_categories", "ticket_priorities", "ticket_status_history", "ticket_assignments", "ticket_comments", "ticket_feedback"]) {
      const [rows] = await pool.query(`SHOW INDEX FROM ${table}`);
      report.indexes[table] = rows.map(row => ({ name: row.Key_name, column: row.Column_name, sequence: row.Seq_in_index }));
    }
    const scopes = { employee: { createdBy: 1 }, technician: { assignedTo: 2 }, admin: {} };
    async function explain(name, run) {
      await run({ async query(sql, values) {
        const [rows] = await pool.query(`EXPLAIN ${sql}`, values);
        report.plans[name] = rows.map(row => ({ table: row.table, type: row.type, possible_keys: row.possible_keys, key: row.key, rows: row.rows, Extra: row.Extra }));
        return [[]];
      } });
    }
    for (const [name, scope] of Object.entries(scopes)) {
      await explain(`${name}RecentTickets`, db => dashboard.getRecentTickets({ ...scope, limit: 5 }, db));
      await explain(`${name}Trend`, db => dashboard.getTicketTrend({ ...scope, period: "monthly", startDate: "2025-10-01 00:00:00", endDate: "2026-10-01 00:00:00" }, db));
      await explain(`${name}Category`, db => dashboard.getTicketCategoryDistribution(scope, db));
      for (const source of ["status", "assignment", "assignmentEnd", "comment"]) {
        await explain(`${name}Activity_${source}`, db => dashboard.getRecentActivitySource(source, { ...scope, includeInternal: name !== "employee", limit: 10 }, db));
      }
    }
    await explain("workload", db => dashboard.getTechnicianWorkloadAnalytics(db));
    await explain("satisfaction", db => feedback.getSatisfactionSummary(db));
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } finally { await pool.end(); }
}
main().catch(error => { console.error("Dashboard EXPLAIN failed:", error.code || error.name); process.exitCode = 1; });
