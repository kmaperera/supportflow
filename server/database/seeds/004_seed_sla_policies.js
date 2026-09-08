require("dotenv").config({ quiet: true });
const pool = require("../../src/config/database");

const policies = [
  ["CRITICAL", 30, 240],
  ["HIGH", 60, 480],
  ["MEDIUM", 240, 1440],
  ["LOW", 480, 2880],
];

async function seedSlaPolicies() {
  let connection;
  let inserted = 0;
  let skipped = 0;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (const [name, responseMinutes, resolutionMinutes] of policies) {
      const [priorities] = await connection.execute(
        "SELECT id FROM ticket_priorities WHERE UPPER(TRIM(name)) = ? FOR UPDATE",
        [name]
      );
      if (priorities.length !== 1) throw new Error("Missing or ambiguous priority");
      const priorityId = priorities[0].id;
      const [existing] = await connection.execute(
        "SELECT id FROM sla_policies WHERE priority_id = ?",
        [priorityId]
      );
      if (existing.length) {
        skipped++;
        continue;
      }
      await connection.execute(
        `INSERT INTO sla_policies (priority_id, response_time_minutes, resolution_time_minutes)
         VALUES (?, ?, ?)`,
        [priorityId, responseMinutes, resolutionMinutes]
      );
      inserted++;
    }
    await connection.commit();
    console.log(`SLA policy seed complete: ${inserted} inserted, ${skipped} skipped.`);
  } catch {
    if (connection) {
      try { await connection.rollback(); } catch { /* Preserve seed failure. */ }
    }
    console.error("SLA policy seed failed. Check migrations and ensure each default priority exists exactly once.");
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    try { await pool.end(); } catch {
      console.error("SLA policy seed failed to close the database pool.");
      process.exitCode = 1;
    }
  }
}

seedSlaPolicies();
