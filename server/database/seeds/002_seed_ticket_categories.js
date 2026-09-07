require("dotenv").config({ quiet: true });

const pool = require("../../src/config/database");

const categories = [
  ["Hardware", "Computer and peripheral hardware issues."],
  ["Software", "Application installation, updates, and troubleshooting."],
  ["Network", "Network connectivity and Wi-Fi issues."],
  ["Email", "Mailbox, delivery, and email client issues."],
  ["Account & Login", "Account access and sign-in issues."],
  ["Printer", "Printer setup and printing issues."],
  ["Access Request", "Requests for access to systems and resources."],
  ["Security", "Security concerns and suspected threats."],
  ["Service Request", "General IT service and assistance requests."],
  ["Other", "Support requests outside the listed categories."],
];

async function seedTicketCategories() {
  let created = 0;
  let skipped = 0;
  try {
    for (const [name, description] of categories) {
      const normalizedName = name.trim().toLowerCase();
      const [existing] = await pool.execute(
        "SELECT id FROM ticket_categories WHERE LOWER(TRIM(name)) = ? LIMIT 1",
        [normalizedName]
      );
      if (existing.length) {
        skipped++;
        continue;
      }
      try {
        await pool.execute(
          "INSERT INTO ticket_categories (name, description, is_active, created_by) VALUES (?, ?, TRUE, NULL)",
          [name.trim(), description]
        );
        created++;
      } catch (error) {
        // A concurrent seed may have inserted the same unique name.
        if (error.code !== "ER_DUP_ENTRY") throw error;
        skipped++;
      }
    }
    console.log(`Category seed complete: ${created} created, ${skipped} skipped.`);
  } catch {
    console.error("Category seed failed. Check database availability and migrations.");
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      console.error("Category seed failed to close the database pool.");
      process.exitCode = 1;
    }
  }
}

seedTicketCategories();
