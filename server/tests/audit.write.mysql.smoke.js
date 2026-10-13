// Explicit local integration check. All temporary inserts are rolled back.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const service = require('../src/modules/audit/audit.service');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require('../src/constants/audit');

async function main() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await service.log({ action: AUDIT_ACTIONS.LOGIN_FAILED, entityType: AUDIT_ENTITY_TYPES.AUTH,
      ipAddress: '2001:db8::1', metadata: { reason: 'test-only verification', password: 'test-only-secret',
        nested: [{ refreshToken: 'test-only-secret', field: 'role' }] } }, { connection, strict: true });
    const [rows] = await connection.execute('SELECT actor_user_id, entity_id, metadata, ip_address, created_at FROM audit_logs WHERE id = ?', [result.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_user_id, null); assert.equal(rows[0].entity_id, null);
    const metadata = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
    assert.deepEqual(metadata, { reason: 'test-only verification', nested: [{ field: 'role' }] });
    assert.equal(rows[0].ip_address, '2001:db8::1'); assert.ok(rows[0].created_at);
    await connection.rollback();
    const [remaining] = await connection.execute('SELECT id FROM audit_logs WHERE id = ?', [result.id]);
    assert.equal(remaining.length, 0);
    console.log('PASS: live audit insert, sanitization, NULL actor/entity and caller transaction rollback; no test rows retained.');
  } finally {
    try { await connection.rollback(); } finally { connection.release(); }
  }
}
main().catch(() => { console.error('Audit write integration check failed (details suppressed).'); process.exitCode = 1; }).finally(() => pool.end());
