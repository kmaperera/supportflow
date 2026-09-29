require('dotenv').config({ quiet: true });
const pool = require('../../src/config/database');
async function main() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Demo seed requires NODE_ENV=development');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const action of ['SYSTEM_INITIALIZED', 'ADMIN_VIEWED_DASHBOARD', 'USER_MANAGEMENT_INITIALIZED']) {
      const description = `[DEMO] ${action}: illustrative seed record, not a real historical action.`;
      await connection.query(`INSERT INTO audit_logs (action, description, metadata)
        SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = ? AND description = ?)`,
      [action, description, JSON.stringify({ isDemo: true, schemaVersion: 1 }), action, description]);
    }
    await connection.commit();
    console.log('Audit demo seed complete (existing demo records preserved).');
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
main().catch(() => { console.error('Audit demo seed failed. Requires development mode and migration 020.'); process.exitCode = 1; }).finally(() => pool.end());
