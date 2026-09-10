const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStatusReportQuery } = require('../src/modules/reports/reports.validation');
const service = require('../src/modules/reports/reports.service');
const pool = require('../src/config/database');
const users = require('../src/modules/users/user.repository');
const jwt = require('jsonwebtoken');

const canonical = ['OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED','REOPENED'];
const zero = canonical.map(status => ({status,totalTickets:0,percentageOfTickets:0}));

test('status report binds shared filters, normalizes counts and zero-fills lifecycle order', async () => {
  let calls = 0;
  const { report } = await service.getStatusReport({startDate:'2026-09-01',endDate:'2026-09-09',categoryId:'3',priorityId:'2',technicianId:'4'}, {async query(sql,params) {
    calls++;
    assert.deepEqual(params,['2026-09-01 00:00:00','2026-09-10 00:00:00',2,3,4]);
    assert.match(sql,/SELECT t.status, COUNT\(\*\) AS total_tickets FROM tickets t WHERE t.created_at >= \? AND t.created_at < \? AND t.priority_id = \? AND t.category_id = \? AND t.assigned_to = \? GROUP BY t.status/);
    assert.doesNotMatch(sql,/JOIN|ticket_status_history|ticket_assignments|sla_policies|DATE\(/);
    return [[{status:'CLOSED',total_tickets:'2'},{status:'OPEN',total_tickets:'1'}]];
  }});
  assert.equal(calls,1);
  assert.equal(report.totalTickets,3);
  assert.deepEqual(report.statuses.map(row=>row.status),canonical);
  assert.deepEqual(report.statuses.map(row=>row.percentageOfTickets),[33.33,0,0,0,0,66.67,0]);
  assert.equal(report.statuses.reduce((sum,row)=>sum+row.totalTickets,0),report.totalTickets);
  for(const row of report.statuses) { assert.equal(typeof row.totalTickets,'number'); assert.equal(typeof row.percentageOfTickets,'number'); }
  const empty=await service.getStatusReport({}, {async query(){return [[]];}});
  assert.deepEqual(empty,{report:{filters:{},totalTickets:0,statuses:zero}});
  await assert.rejects(service.getStatusReport({}, {async query(){return [[{status:'INVALID',total_tickets:1}]];}}),/Invalid persisted ticket status/);
  for(const params of [{status:'OPEN'},{page:'1'},{limit:'10'},{sortBy:'status'},{search:'x'},{startDate:'2026-02-30'},{startDate:'2026-09-10',endDate:'2026-09-01'},{categoryId:'0'},{priorityId:'1.5'},{technicianId:'abc'}]) assert.throws(()=>normalizeStatusReportQuery(params),{statusCode:422});
});

test('status report endpoint enforces ADMIN access and validation', async t => {
  const variables = ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_ACCESS_SECRET'];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = 'priority-report-test'; });
  t.after(() => variables.forEach((key,i) => { if(saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const app = require('../src/app');
  t.mock.method(users, 'findById', async id => ({id,role:{1:'EMPLOYEE',2:'TECHNICIAN',3:'ADMIN'}[id],is_active:1}));
  const query = t.mock.method(pool,'query',async () => [[]]);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/reports/statuses`;
  const get = (actor,suffix='') => fetch(url+suffix,{headers:actor ? {authorization:`Bearer ${jwt.sign({},process.env.JWT_ACCESS_SECRET,{subject:String(actor),expiresIn:'5m'})}`} : {}});
  assert.equal((await get(null)).status,401);
  for(const actor of [1,2]) assert.equal((await get(actor)).status,403);
  for(const suffix of ['?status=OPEN','?status=OPEN','?page=1','?startDate=abc','?technicianId=0']) assert.equal((await get(3,suffix)).status,422);
  assert.equal(query.mock.callCount(),0);
  const response = await get(3);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{success:true,message:'Status report retrieved successfully',data:{report:{filters:{},totalTickets:0,statuses:zero}}});
});


