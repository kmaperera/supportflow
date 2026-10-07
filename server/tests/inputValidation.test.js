const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validationResult } = require('express-validator');

// Real routers and validators; controller sentinels ensure invalid input never
// reaches application services. Existing suites exercise the services themselves.
const authPath = require.resolve('../src/middleware/authenticate');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports(req, res, next) {
  const role = req.headers['x-test-role'];
  if (!role) return res.status(401).json({ success: false });
  req.user = { id: '7', role }; next();
} };
let reached = 0;
const cloudPath = require.resolve('../src/config/cloudinary');
require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: {} };
const modules = path.join(__dirname, '../src/modules');
for (const dir of fs.readdirSync(modules)) {
  for (const file of fs.readdirSync(path.join(modules, dir)).filter(name => name.endsWith('.controller.js'))) {
    const name = path.join(modules, dir, file);
    const controller = require(name);
    for (const key of Object.keys(controller)) controller[key] = (req, res) => {
      reached++;
      res.json({ success: true, body: req.body, params: req.params, actor: req.user?.id });
    };
  }
}
const app = require('../src/app');

test('mounted API rejects malformed input before controllers and preserves frontend request shapes', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function request(method, url, body, role = 'ADMIN') {
    return fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  async function rejected(method, url, body, role) {
    const before = reached;
    const response = await request(method, url, body, role);
    assert.equal(response.status, 422, `${method} ${url}: ${await response.clone().text()}`);
    const error = await response.json();
    assert.equal(error.success, false); assert.ok(Array.isArray(error.errors));
    assert.ok(error.errors.length > 0); assert.equal(reached, before);
    assert.ok(!JSON.stringify(error).includes('stack'));
    return error;
  }
  const user = { firstName: 'Malith', lastName: 'Perera', email: 'malith@example.test', password: 'Password123', role: 'EMPLOYEE' };
  const ticket = { categoryId: 1, priorityId: 1, title: 'Printer offline', description: 'Please check the printer.' };
  const article = { categoryId: 1, title: 'Printer guide', content: 'First line\n\nSecond  line' };

  await t.test('every mounted integer parameter rejects malformed and overflowing IDs', async () => {
    const mounts = { users: 'users/user', tickets: 'tickets/ticket', notifications: 'notifications/notification', sla: 'sla/slaPolicy', 'knowledge-base': 'knowledgeBase/knowledgeBase' };
    for (const [prefix, module] of Object.entries(mounts)) {
      const router = require(`../src/modules/${module}.routes`);
      for (const layer of router.stack.filter(layer => layer.route && layer.route.path.includes(':'))) {
        const route = layer.route;
        if (route.path.endsWith('/attachments') && route.methods.post || route.path.endsWith('/attachments') && route.path.includes(':commentId')) continue;
        const method = Object.keys(route.methods)[0].toUpperCase();
        const keys = [...route.path.matchAll(/:([A-Za-z]+)/g)].map(match => match[0]);
        for (const key of keys) for (const invalid of ['abc', '-1', '0', '1.5', '18446744073709551616', '9'.repeat(100)]) {
          let url = `/${prefix}${route.path}`;
          for (const field of keys) url = url.replace(field, field === key ? invalid : '1');
          const role = method === 'PUT' && prefix === 'tickets' || method === 'PATCH' && route.path === '/:id' && prefix === 'tickets' ? 'EMPLOYEE' : route.path.endsWith('/self-assign') ? 'TECHNICIAN' : 'ADMIN';
          const error = await rejected(method, url, method === 'GET' ? undefined : {}, role);
          assert.ok(error.errors.some(item => item.field === key.slice(1)), `Missing parameter validation: ${method} ${url}`);
        }
      }
    }
  });
  await t.test('pagination, duplicate values, dates, enums, sorting and search boundaries', async () => {
    for (const [url, role] of [['/users', 'ADMIN'], ['/tickets/my', 'EMPLOYEE'], ['/tickets/queue', 'ADMIN'], ['/tickets/assigned-to-me', 'TECHNICIAN'], ['/notifications', 'ADMIN'], ['/knowledge-base/articles', 'ADMIN'], ['/reports/tickets', 'ADMIN'], ['/audit-logs', 'ADMIN']]) {
      for (const query of ['page=0', 'page=1.5', 'page=9007199254740991&limit=100', 'limit=101', 'limit=1&limit=2', 'search=a&search=b']) {
        await rejected('GET', `${url}?${query}`, undefined, role);
      }
    }
    for (const query of ['role=ROOT', 'isActive=no', 'sortBy=password_hash', 'order=sideways', `search=${'a'.repeat(201)}`, 'department=' + 'a'.repeat(151), 'page[]=1']) await rejected('GET', '/users?' + query);
    for (const query of ['status=UNKNOWN', 'fromDate=2026-02-30', 'fromDate=0000-01-01', 'fromDate=2026-12-01&toDate=2026-01-01', 'priorityId=123abc', 'order=sideways']) await rejected('GET', '/tickets/my?' + query, undefined, 'EMPLOYEE');
    for (const query of ['startDate=2026-99-99', 'startDate=abc', 'startDate=2026-12-01&endDate=2026-01-01', 'sortBy=arbitrary', 'sortOrder=sideways']) await rejected('GET', '/reports/tickets?' + query);
    await rejected('GET', '/dashboard/ticket-trend?period=hourly');
    await rejected('GET', '/dashboard/recent-tickets?limit=11');
    await rejected('GET', '/knowledge-base/articles?status=DRAFT');
  });
  await t.test('password limits, strict types, whitespace and unexpected privileged fields', async () => {
    await rejected('POST', '/auth/login', { email: user.email, password: 'a'.repeat(1025) });
    await rejected('POST', '/auth/login', { email: ['a@example.test'], password: 'Password123' });
    await rejected('PATCH', '/auth/change-password', { currentPassword: 'old', newPassword: 'Password123', confirmPassword: 'a'.repeat(1025) });
    for (const route of ['refresh', 'logout', 'logout-all']) await rejected('POST', '/auth/' + route, { userId: 8 });
    for (const extra of [{ isActive: true }, { passwordHash: 'hash' }, { role: ['ADMIN'] }, { firstName: ' ' }, { password: 'a'.repeat(1025) }]) await rejected('POST', '/users', { ...user, ...extra });
    await rejected('PATCH', '/users/1', { role: 'ADMIN' });
    await rejected('PATCH', '/users/1/status', { isActive: 'false' });
    await rejected('PATCH', '/users/1/status', { isActive: false, role: 'ADMIN' });
    await rejected('PATCH', '/users/1/role', { role: 'TECHNICIAN', isActive: true });
    for (const extra of [{ title: ' ' }, { description: ' ' }, { createdBy: 8 }, { status: 'CLOSED' }, { responseDueAt: '2026-01-01' }]) await rejected('POST', '/tickets', { ...ticket, ...extra }, 'EMPLOYEE');
    await rejected('PATCH', '/tickets/1', { assignedTo: 8 }, 'EMPLOYEE');
    await rejected('POST', '/tickets/1/self-assign', { technicianId: 8 }, 'TECHNICIAN');
    await rejected('PATCH', '/tickets/1/assign', { technicianId: 8, assignedBy: 9 });
    for (const value of [undefined, null, 0, -1, 1.5, '123abc', '9'.repeat(30)]) await rejected('PATCH', '/tickets/1/unassign', { expectedAssignmentId: value });
    await rejected('PATCH', '/tickets/1/unassign', { expectedAssignmentId: 1, technicianId: 8 });
    await rejected('PATCH', '/tickets/1/status', { status: 'CLOSED' });
    await rejected('PATCH', '/tickets/1/priority', { priorityId: 'CRITICAL' });
    await rejected('PATCH', '/tickets/1/resolve', { resolutionSummary: ' ' });
    for (const action of ['close', 'reopen']) await rejected('PATCH', '/tickets/1/' + action, { status: 'CLOSED' });
    for (const action of ['comments', 'internal-notes']) {
      await rejected('POST', '/tickets/1/' + action, { content: ' ' });
      await rejected('POST', '/tickets/1/' + action, { content: 'Text', authorUserId: 8, isInternal: true });
    }
    for (const root of ['/tickets/admin/categories', '/knowledge-base/categories']) {
      await rejected('POST', root, { name: ' ', description: null });
      await rejected('POST', root, { name: 'Valid', description: 'a'.repeat(256) });
      await rejected('PATCH', root + '/1/status', { isActive: 'false' });
    }
    await rejected('POST', '/knowledge-base/articles', { ...article, createdBy: 8 });
    await rejected('POST', '/knowledge-base/articles', { ...article, content: ' ' });
    await rejected('POST', '/knowledge-base/articles/suggestions', { title: '', description: '' });
    await rejected('POST', '/knowledge-base/articles/suggestions', { description: 'a'.repeat(5001) });
    for (const action of ['publish', 'unpublish', 'archive']) await rejected('PATCH', '/knowledge-base/articles/1/' + action, { status: 'PUBLISHED' });
    for (const value of [0, -1, 1.5, 'Infinity', 'NaN', '60', 4294967296]) await rejected('PATCH', '/sla/policies/1', { responseTimeMinutes: value, resolutionTimeMinutes: 120 });
    await rejected('PATCH', '/sla/policies/1', { responseTimeMinutes: 60, resolutionTimeMinutes: 30 });
    await rejected('PUT', '/tickets/1/feedback', { rating: 6 }, 'EMPLOYEE');
    await rejected('PUT', '/knowledge-base/articles/1/feedback', { isHelpful: 'false' });
  });
  await t.test('valid frontend payloads and exact BIGINT route IDs survive validation', async () => {
    for (const [method, url, data, role] of [
      ['POST', '/auth/login', { email: user.email, password: user.password }],
      ['POST', '/users', { ...user, phone: null, department: null }],
      ['PATCH', '/users/1/status', { isActive: false }],
      ['GET', '/users?search=%20&isActive=false&sortBy=created_at&order=DESC'],
      ['POST', '/tickets', ticket, 'EMPLOYEE'],
      ['POST', '/tickets/1/self-assign', undefined, 'TECHNICIAN'],
      ['PATCH', '/tickets/1/assign', { technicianId: '1' }],
      ['PATCH', '/tickets/1/unassign', { expectedAssignmentId: '1' }],
      ['PATCH', '/tickets/1/resolve', { resolutionSummary: 'Issue fixed successfully.' }],
      ['GET', '/tickets/my?search=%20&fromDate=2024-02-29&order=desc', undefined, 'EMPLOYEE'],
      ['POST', '/knowledge-base/articles', article],
      ['GET', '/knowledge-base/articles?page=1&limit=10&search=printer%27s%20error'],
      ['POST', '/knowledge-base/articles/suggestions', { title: '', description: 'Printer trouble' }],
      ['PATCH', '/knowledge-base/articles/1/publish', {}],
      ['PATCH', '/sla/policies/1', { responseTimeMinutes: 60, resolutionTimeMinutes: 240 }],
      ['GET', '/reports/tickets?startDate=2026-01-01&endDate=2026-10-01&sortBy=createdAt&sortOrder=desc'],
      ['GET', '/audit-logs?search=%20'],
    ]) assert.equal((await request(method, url, data, role)).status, 200, `${method} ${url}`);
    const response = await request('GET', '/users/18446744073709551615');
    assert.equal((await response.json()).params.id, '18446744073709551615');
    assert.equal((await request('POST', '/tickets', {}, 'ADMIN')).status, 403);
    assert.equal((await request('POST', '/tickets', {}, null)).status, 401);
  });
  await t.test('multipart text metadata is rejected while the existing attachment field works', async () => {
    for (const url of ['/tickets/1/attachments', '/tickets/1/comments/1/attachments']) {
      for (const extra of [false, true]) {
        const form = new FormData(); form.append('attachment', new Blob(['file'], { type: 'text/plain' }), 'notes.txt');
        if (extra) form.append('authorUserId', '8');
        const before = reached;
        const response = await fetch(base + url, { method: 'POST', headers: { 'x-test-role': 'EMPLOYEE' }, body: form });
        assert.equal(response.status, extra ? 422 : 200);
        if (extra) assert.equal(reached, before);
      }
    }
  });
});

test('parser errors do not echo submitted content and the 10 KB limit remains', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const [body, status] of [['{"password":"private-test-value",}', 400], [JSON.stringify({ content: 'a'.repeat(11000) }), 413]]) {
    const before = reached;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(response.status, status);
    const error = await response.json();
    assert.equal(error.success, false); assert.deepEqual(error.errors, []);
    assert.ok(!JSON.stringify(error).includes('private-test-value'));
    assert.equal(reached, before);
  }
});

test('KB TEXT byte limit and shared numeric coercion boundaries', async () => {
  const { createArticleValidation } = require('../src/modules/knowledgeBase/knowledgeBaseArticle.validation');
  for (const [content, valid] of [['x'.repeat(65535), true], ['x'.repeat(65536), false], ['\u{1f600}'.repeat(16384), false]]) {
    const req = { body: { categoryId: 1, title: 'Valid title', content } };
    for (const chain of createArticleValidation) await chain.run(req);
    assert.equal(validationResult(req).isEmpty(), valid);
  }
  const { positiveId } = require('../src/middleware/inputValidation');
  for (const value of [[1], true, {}, '', '1e3', '1abc', Number.MAX_SAFE_INTEGER + 1]) assert.equal(positiveId(value), false);
});
