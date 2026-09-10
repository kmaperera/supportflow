const {test}=require('node:test');
const assert=require('node:assert/strict');
const service=require('../src/modules/reports/reports.service');
const csvService=require('../src/modules/reports/reports.csv');
const pool=require('../src/config/database');
const users=require('../src/modules/users/user.repository');
const jwt=require('jsonwebtoken');
const cases=[
 ['DateRange','date-range','getDateRangeReport',{dailyBreakdown:[{date:'2026-09-01',ticketCount:0}]},'"Date","Ticket Count"', '"2026-09-01","0"'],
 ['TechnicianPerformance','technician-performance','getTechnicianPerformanceReport',{technicians:[{technicianName:'=Name',email:'email',isActive:false,assignedTickets:0,resolvedTickets:0,averageFirstResponseMinutes:null,averageResolutionMinutes:null,responseSlaCompliancePercentage:null,resolutionSlaCompliancePercentage:null}]},'"Technician","Email","Active"', '"\'=Name","email","false","0","0","","","",""'],
 ['Sla','sla','getSlaReport',{responseSla:{trackedTickets:0,metTickets:0,missedTickets:0,pendingTickets:0,completedTickets:0,compliancePercentage:null},resolutionSla:{trackedTickets:3,metTickets:2,missedTickets:1,pendingTickets:0,completedTickets:3,compliancePercentage:66.67}},'"SLA Type","Tracked Tickets"','"Resolution","3","2","1","0","3","66.67"'],
 ['Category','categories','getCategoryReport',{categories:[{categoryName:'Inactive',isActive:false,totalTickets:0,activeTickets:0,resolvedTickets:0,closedTickets:0,percentageOfTickets:0}]},'"Category","Active"','"Inactive","false","0","0","0","0","0"'],
 ['Priority','priorities','getPriorityReport',{priorities:[{priorityName:'CRITICAL',totalTickets:0},{priorityName:'LOW',totalTickets:2}]},'"Priority","Total Tickets"','"CRITICAL","0"'],
 ['Status','statuses','getStatusReport',{statuses:['OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED','REOPENED'].map(status=>({status,totalTickets:0,percentageOfTickets:0}))},'"Status","Total Tickets"','"REOPENED","0","0"']
];
test('all report CSV schemas reuse service output, ordering, nulls and sanitization',async t=>{
 for(const [name,path,method,report,header,expected] of cases){
  const params={startDate:'2026-09-01'};const db={};
  const mock=t.mock.method(service,method,async(p,d)=>{assert.equal(p,params);assert.equal(d,db);return {report};});
  const result=await csvService[`get${name}CsvExport`](params,db);
  assert.ok(result.csv.startsWith('\uFEFF'+header));assert.ok(result.csv.includes(expected));
  assert.match(result.filename,/^supportflow-[a-z-]+-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(mock.mock.callCount(),1);
  if(name==='Status')assert.equal(result.csv.split('\r\n').length,9);
  if(name==='Sla')assert.equal(result.csv.split('\r\n').length,4);
  if(name==='Priority')assert.ok(result.csv.indexOf('CRITICAL')<result.csv.indexOf('LOW'));
  mock.mock.restore();
 }
});
test('six CSV routes enforce ADMIN/validation and preserve empty report shapes',async t=>{
 const vars=['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_ACCESS_SECRET'];const saved=vars.map(k=>process.env[k]);vars.forEach(k=>process.env[k]='report-csv-test');t.after(()=>vars.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];}));
 const app=require('../src/app');t.mock.method(users,'findById',async id=>({id,role:{1:'EMPLOYEE',2:'TECHNICIAN',3:'ADMIN'}[id],is_active:1}));
 const query=t.mock.method(pool,'query',async sql=>sql.includes('response_tracked')?[[{}]]:[[]]);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const get=(path,id,suffix='')=>fetch(`http://127.0.0.1:${server.address().port}/api/v1/reports/${path}/export/csv${suffix}`,{headers:id?{authorization:`Bearer ${jwt.sign({},process.env.JWT_ACCESS_SECRET,{subject:String(id),expiresIn:'5m'})}`}:{}});
 for(const [name,path] of cases){
  const before=query.mock.callCount();
  for(const [actor,code] of [[null,401],[1,403],[2,403]]){const r=await get(path,actor);assert.equal(r.status,code);assert.match(r.headers.get('content-type'),/json/);}
  for(const suffix of ['?page=1','?fields=name','?startDate=2026-02-30','?startDate=2026-09-10&endDate=2026-09-01']){const r=await get(path,3,suffix);assert.equal(r.status,422);assert.match(r.headers.get('content-type'),/json/);assert.equal(r.headers.get('content-disposition'),null);}
  if(name==='DateRange')assert.equal((await get(path,3)).status,422);
  assert.equal(query.mock.callCount(),before);
  const r=await get(path,3,name==='DateRange'?'?startDate=2026-09-01&endDate=2026-09-02':'');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/csv/);assert.match(r.headers.get('content-disposition'),/^attachment;/);
  const csv=Buffer.from(await r.arrayBuffer()).toString('utf8');assert.ok(csv.startsWith('\uFEFF"'));
  assert.equal(csv.split('\r\n').length,name==='DateRange'||name==='Sla'?4:name==='Status'?9:2);
 }
 t.mock.method(pool,'query',async()=>{throw new Error('sensitive SQL');});
 for(const [name,path] of cases){const r=await get(path,3,name==='DateRange'?'?startDate=2026-09-01&endDate=2026-09-02':'');assert.equal(r.status,500);assert.equal(r.headers.get('content-disposition'),null);assert.equal((await r.json()).message,'Internal server error');}
});
