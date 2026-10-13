// Explicit local DB verification; no audit events are inserted or modified.
// --verify-migration replays the existing idempotent CREATE against this DB.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/config/database');
const service = require('../src/modules/audit/audit.service');

async function main() {
  const [before] = await pool.query('SELECT * FROM audit_logs ORDER BY id');
  if (process.argv.includes('--verify-migration')) {
    await pool.query(fs.readFileSync(path.join(__dirname, '../database/migrations/020_create_audit_logs_table.sql'), 'utf8'));
    const [after] = await pool.query('SELECT * FROM audit_logs ORDER BY id');
    assert.deepEqual(after, before);
  }
  const [columns] = await pool.query('DESCRIBE audit_logs');
  const expected = {
    id: ['bigint unsigned', 'NO'], actor_user_id: ['bigint unsigned', 'YES'],
    action: ['varchar(100)', 'NO'], entity_type: ['varchar(100)', 'YES'],
    entity_id: ['bigint unsigned', 'YES'], description: ['varchar(1000)', 'YES'],
    metadata: ['json', 'YES'], ip_address: ['varchar(45)', 'YES'], created_at: ['timestamp', 'NO'],
  };
  for (const [name, [type, nullable]] of Object.entries(expected)) {
    const column = columns.find(column => column.Field === name);
    assert.ok(column);
    assert.equal(column.Type, type);
    assert.equal(column.Null, nullable);
  }
  assert.ok(!columns.some(column => column.Field === 'updated_at'));
  assert.equal(columns.find(column => column.Field === 'id').Extra, 'auto_increment');
  assert.equal(columns.find(column => column.Field === 'created_at').Default.toUpperCase(), 'CURRENT_TIMESTAMP');
  const [indexes] = await pool.query('SHOW INDEX FROM audit_logs');
  for (const [name, keys] of Object.entries({ PRIMARY: ['id'], idx_audit_created: ['created_at', 'id'],
    idx_audit_actor_created: ['actor_user_id', 'created_at', 'id'],
    idx_audit_action_created: ['action', 'created_at', 'id'],
    idx_audit_entity_created: ['entity_type', 'entity_id', 'created_at', 'id'] })) {
    assert.deepEqual(indexes.filter(index => index.Key_name === name).sort((a, b) => a.Seq_in_index - b.Seq_in_index).map(index => index.Column_name), keys);
  }
  const [foreignKeys] = await pool.query(`SELECT r.DELETE_RULE, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME
    FROM information_schema.REFERENTIAL_CONSTRAINTS r JOIN information_schema.KEY_COLUMN_USAGE k
    ON k.CONSTRAINT_SCHEMA=r.CONSTRAINT_SCHEMA AND k.TABLE_NAME=r.TABLE_NAME AND k.CONSTRAINT_NAME=r.CONSTRAINT_NAME
    WHERE r.CONSTRAINT_SCHEMA=DATABASE() AND r.TABLE_NAME='audit_logs' AND k.COLUMN_NAME='actor_user_id'`);
  assert.equal(foreignKeys.length, 1);
  assert.equal(foreignKeys[0].DELETE_RULE, 'SET NULL');
  assert.equal(foreignKeys[0].REFERENCED_TABLE_NAME, 'users');
  assert.equal(foreignKeys[0].REFERENCED_COLUMN_NAME, 'id');
  const result = await service.getLogs({ limit: 1 });
  assert.equal(result.pagination.total, before.length);
  if (before.length) {
    assert.equal((await service.getLogs({ page: before.length, limit: 1 })).logs.length, 1);
    const row = before[0];
    const filters = { action: row.action };
    for (const [field, column] of [['actorUserId', 'actor_user_id'], ['entityType', 'entity_type'], ['entityId', 'entity_id']]) {
      if (row[column] != null) filters[field] = String(row[column]);
    }
    assert.ok((await service.getLogs(filters)).pagination.total > 0);
  }
  for (const filters of [{ actorUserId: '18446744073709551615' }, { entityType: 'PHASE_18_14_NONEXISTENT' },
    { entityId: '18446744073709551615' }, { startDate: '2000-01-01', endDate: '2099-12-31' }, { search: 'DEMO' }]) {
    const filtered = await service.getLogs(filters);
    assert.ok(Number.isSafeInteger(filtered.pagination.total));
  }
  console.log(`PASS: audit schema, indexes, actor FK, retrieval/filter compatibility; ${before.length} existing rows preserved.`);
}

main().catch(() => {
  // Assertions/SQL errors can contain row data; never dump them.
  console.error('Audit schema verification failed; inspect schema and DB configuration locally.');
  process.exitCode = 1;
}).finally(() => pool.end());
