const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const pool = require('../src/config/database');
const tickets = require('../src/modules/tickets/ticket.repository');
const users = require('../src/modules/users/user.repository');
const articles = require('../src/modules/knowledgeBase/knowledgeBaseArticle.repository');
const reports = require('../src/modules/reports/reports.repository');
const dashboard = require('../src/modules/dashboard/dashboard.repository');
const audit = require('../src/modules/audit/audit.repository');
const notifications = require('../src/modules/notifications/notification.repository');
const payloads = ["'", '"', "%'", "admin' OR '1'='1", '1 OR 1=1', "test'); SELECT 1; --"];

function recorder(t) {
  const calls = [];
  const query = async (sql, values = []) => {
    calls.push({ sql: typeof sql === 'string' ? sql : sql.sql, values });
    return [Object.assign([{ total: 0 }], { insertId: 1, affectedRows: 1 })];
  };
  t.mock.method(pool, 'query', query); t.mock.method(pool, 'execute', query);
  return { calls, db: { query, execute: query } };
}

test('search text never changes SQL structure; existing LIKE wildcard semantics remain', async t => {
  const { calls, db } = recorder(t);
  const searches = [
    value => users.findAll({ search: value }), value => users.countAll({ search: value }),
    value => users.findAssignableTechnicians({ search: value }), value => users.getTechnicianWorkload({ search: value }),
    value => tickets.findByCreator(1, { search: value }), value => tickets.countByCreator(1, { search: value }),
    value => tickets.findQueue({ currentUserRole: 'ADMIN', search: value }),
    value => tickets.findAssignedToTechnician(1, { search: value }),
    value => articles.findAll({ search: value }, db), value => articles.countAll({ search: value }, db),
    value => articles.findSuggestedArticles({ terms: [value] }, db),
    value => reports.getTicketReportRows({ filters: { search: value }, pagination: { limit: 20, offset: 0 } }, db),
    value => reports.getTicketReportExportRows({ filters: { search: value } }, db),
    value => reports.countTicketReportRows({ filters: { search: value } }, db),
    value => audit.findAll({ filters: { search: value }, limit: 20, offset: 0 }, db),
    value => audit.countAll({ search: value }, db),
  ];
  for (const run of searches) {
    await run('baseline'); const baseline = calls.at(-1);
    for (const payload of [...payloads, '50%_!']) {
      await run(payload); const actual = calls.at(-1);
      assert.equal(actual.sql, baseline.sql);
      const literal = actual.sql.includes("ESCAPE '!'");
      const pattern = `%${literal ? payload.replace(/[!%_]/g, value => '!' + value) : payload}%`;
      assert.ok(actual.values.includes(pattern));
      assert.equal(actual.values.length, baseline.values.length);
    }
  }
});

test('repository identifier maps reject injected sorts, columns, sources and grouping without SQL calls', async t => {
  const { calls, db } = recorder(t);
  for (const value of ['created_at DESC; SELECT 1', 'DESC; DROP', '__proto__', 'constructor', 'toString']) {
    for (const run of [
      () => users.findAll({ sortBy: value }), () => users.findAll({ order: value }),
      () => tickets.findByCreator(1, { sortBy: value }), () => tickets.findByCreator(1, { order: value }),
      () => tickets.findQueue({ currentUserRole: 'ADMIN', sortBy: value }),
      () => reports.getTicketReportRows({ filters: {}, pagination: { limit: 10, offset: 0 }, sorting: { sortBy: value, sortOrder: 'DESC' } }, db),
      () => reports.getTicketReportExportRows({ filters: {}, sorting: { sortBy: 'createdAt', sortOrder: value } }, db),
      () => dashboard.getTicketTrend({ period: value }, db),
      () => dashboard.getRecentActivitySource(value, {}, db),
      () => reports.getTechnicianHistoricalCounts({}, value, db),
      () => reports.getTechnicianCompletionMetrics({}, value, db),
      () => users.updateDetails(1, { [value]: 'data' }),
      () => tickets.updateEmployeeDetails(1, { [value]: 'data' }, db),
    ]) {
      const before = calls.length; await assert.rejects(run, TypeError); assert.equal(calls.length, before);
    }
  }
  await users.findAll({ sortBy: 'email', order: 'asc' });
  assert.match(calls.at(-1).sql, /ORDER BY email ASC/);
  await tickets.findQueue({ currentUserRole: 'ADMIN', sortBy: 'created_at', order: 'desc' });
  assert.match(calls.at(-1).sql, /ORDER BY t.created_at DESC/);
  for (const period of ['daily', 'monthly']) await dashboard.getTicketTrend({ period, startDate: '2026-01-01', endDate: '2026-02-01' }, db);
});

test('IDs, identity, content, metadata, dates and transaction values remain placeholder data', async t => {
  const { calls, db } = recorder(t);
  const run = async payload => {
    await users.findByEmail(payload); await users.findById(payload, db); await users.updatePassword(1, payload);
    await users.updateDetails(1, { firstName: payload });
    await require('../src/modules/auth/refreshToken.repository').findActiveByHash(payload);
    await tickets.findById(payload, db); await tickets.lockById(payload, db);
    await tickets.updateEmployeeDetails(1, { title: payload, description: payload }, db);
    await tickets.updateAssignment(1, payload, 'ASSIGNED', db);
    await tickets.updateSlaDeadlines(1, { responseDueAt: payload, resolutionDueAt: payload }, db);
    await require('../src/modules/tickets/ticketAssignment.repository').createAssignment({ ticketId: payload, technicianId: 1, assignedBy: payload, assignmentType: 'ADMIN' }, db);
    await require('../src/modules/tickets/ticketComment.repository').createComment({ ticketId: 1, userId: 1, commentType: 'PUBLIC', content: payload }, db);
    await require('../src/modules/tickets/ticketAttachment.repository').createAttachment({ ticketId: 1, uploadedBy: 1, originalName: payload, publicId: payload, fileUrl: payload, resourceType: 'raw', mimeType: 'text/plain', fileSize: 1 }, db);
    await notifications.createNotification({ userId: 1, type: 'TEST', title: payload, message: payload, dedupeKey: payload }, db);
    await articles.create({ categoryId: 1, title: payload, slug: payload, content: payload, createdBy: 1 }, db);
    await require('../src/modules/sla/slaPolicy.repository').findByPriorityName(payload, db);
    await reports.getStatusReport({ filters: { startAt: payload, categoryId: payload } }, db);
    await dashboard.getTicketStatusDistribution({ createdBy: payload }, db);
    await audit.countAll({ action: payload, actorUserId: payload }, db);
  };
  await run('baseline'); const baseline = calls.splice(0);
  for (const payload of payloads) {
    await run(payload); const actual = calls.splice(0);
    assert.equal(actual.length, baseline.length);
    actual.forEach((call, index) => {
      assert.equal(call.sql, baseline[index].sql); assert.ok(call.values.includes(payload));
    });
  }
});

test('pagination remains bound and guards direct repository calls; suggestion structure is bounded', async t => {
  const { calls, db } = recorder(t);
  const lists = [
    (limit, offset) => articles.findAll({ limit, offset }, db),
    (limit, offset) => notifications.findByUserId(1, { limit, offset }, db),
    (limit, offset) => audit.findAll({ filters: {}, limit, offset }, db),
    (limit, offset) => users.findAll({ limit, offset }),
    (limit, offset) => tickets.findByCreator(1, { limit, offset }),
    (limit, offset) => reports.getTicketReportRows({ filters: {}, pagination: { limit, offset } }, db),
  ];
  for (const list of lists) {
    await list(10, 20); assert.match(calls.at(-1).sql, /LIMIT \? OFFSET \?/);
    assert.deepEqual(calls.at(-1).values.slice(-2), [10, 20]);
    for (const [limit, offset] of [['10; SELECT 1', 0], [10, '0 OR 1=1'], [101, 0], [0, 0], [1.5, 0], [10, -1], [Infinity, 0]]) {
      const before = calls.length; await assert.rejects(() => list(limit, offset), TypeError); assert.equal(calls.length, before);
    }
  }
  await assert.rejects(() => articles.findSuggestedArticles({ terms: Array(9).fill('term') }, db), TypeError);
  assert.deepEqual(await articles.findSuggestedArticles({ terms: [] }, db), []);
  assert.equal(pool.pool.config.connectionConfig.multipleStatements, false);
});

test('actual API rejects injected identifiers and keeps accepted search payloads in repository parameters', async t => {
  const authPath = require.resolve('../src/middleware/authenticate');
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports(req, res, next) {
    req.user = { id: '1', role: req.headers['x-test-role'] || 'ADMIN' }; next();
  } };
  const cloudPath = require.resolve('../src/config/cloudinary');
  require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: {} };
  const calls = [];
  const query = async (sql, values = []) => {
    sql = typeof sql === 'string' ? sql : sql.sql;
    calls.push({ sql, values });
    return [/COUNT\(\*\) AS total/.test(sql) ? [{ total: 0 }] : []];
  };
  t.mock.method(pool, 'query', query); t.mock.method(pool, 'execute', query);
  t.mock.method(pool, 'getConnection', async () => ({ query: async (sql, values) => sql.includes('@@session') ? [[{ zone: '+00:00' }]] : query(sql, values), release() {} }));
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const route of ['/users', '/tickets/queue', '/knowledge-base/articles', '/reports/tickets', '/audit-logs']) {
    for (const payload of payloads) {
      const before = calls.length;
      const response = await fetch(base + route + '?search=' + encodeURIComponent(payload));
      assert.equal(response.status, 200, route + ': ' + await response.clone().text());
      assert.ok(calls.slice(before).some(call => call.values.some(value => typeof value === 'string' && value.includes(payload.replace(/[!%_]/g, x => '!' + x))) || call.values.includes('%' + payload + '%')));
    }
  }
  for (const url of ['/tickets/' + encodeURIComponent('1 OR 1=1'), '/users?sortBy=' + encodeURIComponent('created_at DESC; SELECT 1'), '/reports/tickets?sortOrder=' + encodeURIComponent('DESC; DROP'), '/dashboard/ticket-trend?period=' + encodeURIComponent('monthly; SELECT 1'), '/reports/tickets?categoryId=' + encodeURIComponent('1 OR 1=1'), '/reports/tickets?startDate=' + encodeURIComponent("2026-01-01' OR '1'='1")]) {
    const before = calls.length; assert.equal((await fetch(base + url)).status, 422, url); assert.equal(calls.length, before);
  }
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: "admin' OR '1'='1@example.com", password: 'arbitrary-test-password' }) });
  assert.ok([401, 422].includes(login.status));
  t.mock.method(pool, 'execute', async () => { throw Object.assign(new Error('private SQL SELECT text'), { code: 'ER_PARSE_ERROR' }); });
  const failure = await fetch(base + '/users'); assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { success: false, message: 'Internal server error', errors: [] });
});
