const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCategoryReportQuery } = require('../src/modules/reports/reports.validation');
const service = require('../src/modules/reports/reports.service');
const pool = require('../src/config/database');
const users = require('../src/modules/users/user.repository');
const jwt = require('jsonwebtoken');

test('category report preserves zero/inactive categories and binds creation/current-assignment filters', async () => {
  let calls = 0;
  const result = await service.getCategoryReport({ startDate: '2026-09-01', endDate: '2026-09-09', priorityId: '2', technicianId: '4' }, { async query(sql, params) {
    calls++;
    assert.deepEqual(params, ['2026-09-01 00:00:00', '2026-09-10 00:00:00', 2, 4]);
    assert.match(sql, /FROM ticket_categories c LEFT JOIN \(/);
    assert.match(sql, /FROM tickets t WHERE t.created_at >= \? AND t.created_at < \? AND t.priority_id = \? AND t.assigned_to = \?\s*\) t ON t.category_id = c.id/);
    assert.match(sql, /COUNT\(t.id\)/);
    assert.match(sql, /'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'/);
    assert.match(sql, /ORDER BY total_tickets DESC, category_name ASC, category_id ASC/);
    assert.doesNotMatch(sql, /ticket_assignments|knowledge_base|sla_policies|is_active =|SELECT \*/);
    return [[
      { category_id: '1', category_name: 'A', is_active: '0', total_tickets: '2', active_tickets: '1', resolved_tickets: '1', closed_tickets: '0' },
      { category_id: '2', category_name: 'B', is_active: 1, total_tickets: '1', active_tickets: '0', resolved_tickets: '0', closed_tickets: '1' },
      { category_id: '3', category_name: 'C', is_active: 1, total_tickets: '0', active_tickets: '0', resolved_tickets: '0', closed_tickets: '0' }
    ]];
  } });
  assert.equal(calls, 1);
  assert.equal(result.report.totalTickets, 3);
  assert.deepEqual(result.report.categories.map(c => c.percentageOfTickets), [66.67, 33.33, 0]);
  assert.equal(result.report.categories[0].isActive, false);
  for (const c of result.report.categories) {
    for (const key of ['categoryId', 'totalTickets', 'activeTickets', 'resolvedTickets', 'closedTickets', 'percentageOfTickets']) assert.equal(typeof c[key], 'number');
    assert.equal(c.totalTickets, c.activeTickets + c.resolvedTickets + c.closedTickets);
  }
  const empty = await service.getCategoryReport({}, { async query() { return [[{ category_id: '3', category_name: 'C', is_active: 0, total_tickets: 0 }]]; } });
  assert.equal(empty.report.totalTickets, 0);
  assert.deepEqual(empty.report.categories[0], { categoryId: 3, categoryName: 'C', isActive: false, totalTickets: 0, activeTickets: 0, resolvedTickets: 0, closedTickets: 0, percentageOfTickets: 0 });
  for (const params of [{categoryId:'1'}, {status:'OPEN'}, {page:'1'}, {limit:'10'}, {sortBy:'name'}, {startDate:'2026-02-30'}, {endDate:'2026-13-01'}, {startDate:'2026-09-10',endDate:'2026-09-01'}, {priorityId:'0'}, {technicianId:'1.5'}]) assert.throws(() => normalizeCategoryReportQuery(params), {statusCode:422});
});

test('category report endpoint enforces ADMIN access and validation', async t => {
  const variables = ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_ACCESS_SECRET'];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = 'category-report-test'; });
  t.after(() => variables.forEach((key,i) => { if(saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const app = require('../src/app');
  t.mock.method(users, 'findById', async id => ({id,role:{1:'EMPLOYEE',2:'TECHNICIAN',3:'ADMIN'}[id],is_active:1}));
  const query = t.mock.method(pool,'query',async () => [[]]);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/reports/categories`;
  const get = (actor,suffix='') => fetch(url+suffix,{headers:actor ? {authorization:`Bearer ${jwt.sign({},process.env.JWT_ACCESS_SECRET,{subject:String(actor),expiresIn:'5m'})}`} : {}});
  assert.equal((await get(null)).status,401);
  for(const actor of [1,2]) assert.equal((await get(actor)).status,403);
  for(const suffix of ['?categoryId=1','?status=OPEN','?page=1','?startDate=abc','?technicianId=0']) assert.equal((await get(3,suffix)).status,422);
  assert.equal(query.mock.callCount(),0);
  const response = await get(3);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{success:true,message:'Category report retrieved successfully',data:{report:{filters:{},totalTickets:0,categories:[]}}});
});
