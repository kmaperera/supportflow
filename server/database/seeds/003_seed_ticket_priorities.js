require("dotenv").config({ quiet: true });
const pool = require("../../src/config/database");

const priorities = [
  ["LOW", "Minor issue with limited impact; normal work can continue.", 1],
  ["MEDIUM", "Issue affecting productivity with a workaround available.", 2],
  ["HIGH", "Significant disruption requiring prompt attention.", 3],
  ["CRITICAL", "Major outage or critical business impact requiring immediate attention.", 4],
];

async function seedTicketPriorities() {
  let inserted = 0;
  let skipped = 0;
  try {
    for (const [name, description, sortOrder] of priorities) {
      const [existing] = await pool.execute(
        "SELECT name, sort_order, is_active FROM ticket_priorities WHERE UPPER(TRIM(name)) = ? OR sort_order = ?",
        [name, sortOrder]
      );
      if (existing.length) {
        const matches = existing.length === 1 &&
          existing[0].name.trim().toUpperCase() === name &&
          Number(existing[0].sort_order) === sortOrder &&
          Boolean(existing[0].is_active);
        if (!matches) {
          const error = new Error("Priority seed conflict");
          error.code = "PRIORITY_SEED_CONFLICT";
          throw error;
        }
        skipped++;
        continue;
      }
      await pool.execute(
        "INSERT INTO ticket_priorities (name, description, sort_order, is_active) VALUES (?, ?, ?, TRUE)",
        [name, description, sortOrder]
      );
      inserted++;
    }
    console.log(`Priority seed complete: ${inserted} inserted, ${skipped} skipped.`);
  } catch (error) {
    if (error.code === "PRIORITY_SEED_CONFLICT" || error.code === "ER_DUP_ENTRY") {
      console.error("Priority seed stopped: conflicting existing name, sort order, or active status. Existing records were preserved.");
    } else {
      console.error("Priority seed failed. Check database availability and migrations.");
    }
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      console.error("Priority seed failed to close the database pool.");
      process.exitCode = 1;
    }
  }
}

seedTicketPriorities();
