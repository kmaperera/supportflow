// Read-only synthetic identity probe; never reads or creates user records.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
(async () => {
  const [rows] = await pool.query("SELECT CAST('9007199254740992' AS UNSIGNED) AS id_a, CAST('9007199254740993' AS UNSIGNED) AS id_b, CAST('7' AS UNSIGNED) AS small_id");
  assert.equal(String(rows[0].id_a), '9007199254740992');
  assert.equal(String(rows[0].id_b), '9007199254740993');
  assert.notEqual(String(rows[0].id_a), String(rows[0].id_b));
  assert.equal(rows[0].small_id, 7);
  console.log('PASS: MySQL preserves distinct BIGINT identities; safe IDs remain numbers.');
})().catch(() => { console.error('BIGINT identity probe failed'); process.exitCode = 1; }).finally(() => pool.end());
