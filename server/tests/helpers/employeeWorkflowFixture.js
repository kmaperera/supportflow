// Disposable local Employee journey backend. Actual HTTP/MySQL and Socket.IO;
// only external byte storage/email are stubs, scoped to this test process.
module.exports = async function employeeWorkflowFixture() {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env'), quiet: true });
  const assert = require('node:assert/strict');
  const { randomUUID } = require('node:crypto');
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST));
  Object.assign(process.env, { NODE_ENV: 'test', CLIENT_URL: 'http://localhost:5173' });
  const pool = require('../../src/config/database');
  const original = { query: pool.query, execute: pool.execute, getConnection: pool.getConnection };
  const connection = await pool.getConnection(); await connection.beginTransaction();
  await connection.query("SET SESSION time_zone='+00:00'");
  let sequence = 0; const savepoints = [];
  const db = {
    query: (...args) => connection.query(...args), execute: (...args) => connection.execute(...args),
    async beginTransaction() { const name = `employee_${++sequence}`; await connection.query(`SAVEPOINT ${name}`); savepoints.push(name); },
    async commit() { await connection.query(`RELEASE SAVEPOINT ${savepoints.pop()}`); },
    async rollback() { if (savepoints.length) { const name = savepoints.pop(); await connection.query(`ROLLBACK TO SAVEPOINT ${name}`); await connection.query(`RELEASE SAVEPOINT ${name}`); } },
    release() {}, destroy() { throw new Error('Unexpected fixture connection destruction'); },
  };
  pool.query = db.query; pool.execute = db.execute; pool.getConnection = async () => db;
  const users = []; let server, io;
  async function cleanup() {
    // Graceful close lets in-flight SQL/controllers finish before pool methods
    // are restored and the outer transaction is rolled back.
    if (io) await new Promise(resolve => io.close(resolve)); else if (server) await new Promise(resolve => server.close(resolve));
    Object.assign(pool, original);
    try {
      await connection.rollback();
      for (const [table, column] of [['users','id'],['tickets','created_by'],['notifications','user_id'],['refresh_tokens','user_id'],['audit_logs','actor_user_id']]) {
        if (!users.length) continue;
        const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IN (${users.map(() => '?').join(',')})`, users.map(user => user.id));
        assert.equal(Number(rows[0].total), 0, 'Fixture rows remained');
      }
    } finally { connection.release(); await pool.end(); }
  }
  try {
    const run = randomUUID().replaceAll('-', ''), password = `Employee-${randomUUID()}!`;
    const hash = await require('../../src/utils/password').hashPassword(password);
    for (const role of ['EMPLOYEE','EMPLOYEE','TECHNICIAN','ADMIN']) {
      const email = `employee-${run}-${users.length}@example.test`;
      const [row] = await connection.execute("INSERT INTO users (first_name,last_name,email,password_hash,role,is_active,must_change_password) VALUES ('Employee','Fixture',?,?,?,TRUE,FALSE)", [email,hash,role]);
      users.push({ id: String(row.insertId), email, role });
    }
    const [category] = await connection.execute('INSERT INTO ticket_categories (name,is_active) VALUES (?,TRUE)', ['Employee fixture ' + run]);
    const [inactive] = await connection.execute('INSERT INTO ticket_categories (name,is_active) VALUES (?,FALSE)', ['Hidden employee fixture ' + run]);
    const [priorities] = await connection.query('SELECT p.id,p.name FROM ticket_priorities p JOIN sla_policies s ON s.priority_id=p.id WHERE p.is_active=TRUE AND s.is_active=TRUE ORDER BY p.id LIMIT 1');
    assert.ok(priorities.length, 'Active seeded priority/SLA required');
    const [kbCategory] = await connection.execute('INSERT INTO knowledge_base_categories (name,is_active) VALUES (?,TRUE)', ['Employee knowledge ' + run]);
    const articles = [];
    for (const state of ['PUBLISHED','DRAFT','ARCHIVED']) {
      const [row] = await connection.execute('INSERT INTO knowledge_base_articles (category_id,title,slug,content,status,created_by) VALUES (?,?,?,?,?,?)', [kbCategory.insertId, 'Employee printer guide ' + state + ' ' + run, 'employee-' + run + '-' + state.toLowerCase(), 'Harmless printer troubleshooting & <guidance> with long content. '.repeat(8), state, users[3].id]);
      articles.push({ id: String(row.insertId), state });
    }
    require('../../src/config/mailer').getMailerTransporter = () => ({ sendMail: async () => ({ messageId: 'fixture', accepted: [], rejected: [] }) });
    require('../../src/config/mailer').getDefaultFrom = () => ({ address: 'fixture@example.test', name: 'Fixture' });
    const assets = new Map();
    require('../../src/services/cloudinaryUpload.service').uploadAttachmentBuffer = async ({ buffer }) => {
      const publicId = `fixture/${randomUUID()}`; assets.set(publicId, buffer);
      return { publicId, secureUrl: 'https://example.invalid/fixture', resourceType: 'raw', deliveryType: 'authenticated', bytes: buffer.length };
    };
    require('../../src/services/attachmentDownload.service').fetchAttachment = async file => { assert.ok(assets.has(file.publicId)); return assets.get(file.publicId); };
    server = require('node:http').createServer(require('../../src/app'));
    io = require('../../src/config/socket').initializeSocket(server);
    server.listen(5099, 'localhost'); await new Promise(resolve => server.once('listening', resolve));
    const request = async (actor, method, route, body, expected = 200) => {
      const response = await fetch('http://localhost:5099/api/v1' + route, { method, headers: { 'Content-Type': 'application/json', ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      assert.equal(response.status, expected); return response.json();
    };
    for (const user of users.slice(1)) user.token = (await request(null, 'POST', '/auth/login', { email: user.email, password })).data.accessToken;
    return { users, password, run, categoryId: String(category.insertId), inactiveCategoryId: String(inactive.insertId), priority: priorities[0], articles, connection, io, request, cleanup };
  } catch (error) { await cleanup(); throw error; }
};
