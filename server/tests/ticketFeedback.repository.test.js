const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const repository = require("../src/modules/ticketFeedback/ticketFeedback.repository");

test("ticket feedback migration declares rating, uniqueness and historical integrity constraints", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../database/migrations/018_create_ticket_feedback_table.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ticket_feedback/);
  assert.match(sql, /rating TINYINT UNSIGNED NOT NULL/);
  assert.match(sql, /comment VARCHAR\(1000\) NULL/);
  assert.match(sql, /CHECK \(rating BETWEEN 1 AND 5\)/);
  assert.match(sql, /UNIQUE INDEX \w+ \(ticket_id\)/);
  assert.match(sql, /FOREIGN KEY \(ticket_id\) REFERENCES tickets\(id\) ON DELETE CASCADE/);
  assert.match(sql, /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE RESTRICT/);
  for (const field of ["user_id", "rating", "created_at"]) assert.ok(sql.includes(`(${field})`));
  assert.match(sql, /updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/);
});

test("feedback lookup returns raw rows or null with a parameterized ticket ID", async () => {
  const row = { id: "91", ticket_id: "7", user_id: "3", rating: 5, comment: null };
  for (const rows of [[row], []]) {
    const result = await repository.findByTicketId("7", { async query(sql, values) {
      assert.match(sql, /FROM ticket_feedback WHERE ticket_id = \? LIMIT 1/);
      assert.deepEqual(values, ["7"]);
      return [rows];
    } });
    assert.equal(result, rows.length ? row : null);
  }
});

test("feedback writes bind comments, preserve author on update and propagate database errors", async () => {
  const comment = "Thanks'); DROP TABLE users; --";
  const inserted = await repository.create({ ticketId: "7", userId: "3", rating: 5, comment }, { async query(sql, values) {
    assert.match(sql, /INSERT INTO ticket_feedback \(ticket_id, user_id, rating, comment\)/);
    assert.ok(!sql.includes(comment));
    assert.deepEqual(values, ["7", "3", 5, comment]);
    return [{ insertId: 91 }];
  } });
  assert.equal(inserted, 91);
  await repository.create({ ticketId: 7, userId: 3, rating: 4 }, { async query(sql, values) {
    assert.deepEqual(values, [7, 3, 4, null]);
    return [{ insertId: 92 }];
  } });
  for (const affectedRows of [0, 1]) {
    assert.equal(await repository.updateByTicketId({ ticketId: 7, rating: 3 }, { async query(sql, values) {
      assert.equal(sql, "UPDATE ticket_feedback SET rating = ?, comment = ? WHERE ticket_id = ?");
      assert.deepEqual(values, [3, null, 7]);
      return [{ affectedRows }];
    } }), affectedRows);
  }
  for (const code of ["ER_DUP_ENTRY", "ER_NO_REFERENCED_ROW_2", "ER_CHECK_CONSTRAINT_VIOLATED"]) {
    const error = Object.assign(new Error("Database constraint rejected write"), { code });
    await assert.rejects(repository.create({ ticketId: 7, userId: 3, rating: 5 }, { async query() { throw error; } }), caught => caught === error);
  }
});
