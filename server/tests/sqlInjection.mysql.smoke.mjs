// Read-only driver verification against the configured local MySQL connection.
// No application rows are read or changed; no seed/migration is executed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const pool = require('../src/config/database');
const payloads = ["'", '"', "%'", "admin' OR '1'='1", '1 OR 1=1', "test'); SELECT 1; --", "backslash\\' OR '1'='1"];
try {
  const [mode] = await pool.query('SELECT @@session.sql_mode AS mode');
  assert.ok(!mode[0].mode.split(',').includes('NO_BACKSLASH_ESCAPES'), 'mysql2 text-query escaping requires compatible SQL mode');
  for (const method of ['query', 'execute']) {
    for (const payload of payloads) {
      const [rows] = await pool[method]("SELECT ? AS supplied, ? = 'known-safe-value' AS matched", [payload, payload]);
      assert.equal(rows.length, 1); assert.equal(rows[0].supplied, payload); assert.equal(rows[0].matched, 0);
    }
  }
  assert.equal(pool.pool.config.connectionConfig.multipleStatements, false);
  await assert.rejects(() => pool.query('SELECT 1; SELECT 2'), error => error.code === 'ER_PARSE_ERROR');
  console.log('PASS: query/execute preserve seven payloads as data; SQL mode compatible; multiple statements blocked. No application data changed.');
} finally { await pool.end(); }
