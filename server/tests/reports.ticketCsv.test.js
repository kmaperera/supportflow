const {test}=require('node:test');
const assert=require('node:assert/strict');
const service=require('../src/modules/reports/reports.service');
const repository=require('../src/modules/reports/reports.repository');
const {normalizeTicketCsvQuery}=require('../src/modules/reports/reports.validation');
const pool=require('../src/config/database');
const users=require('../src/modules/users/user.repository');
const jwt=require('jsonwebtoken');
test('CSV shares row SQL and exports all rows with deliberate safe columns',async()=>{
 let paginated;
 await repository.getTicketReportRows({filters:{search:'wifi',status:'OPEN'},sorting:{sortBy:'title',sortOrder:'ASC'},pagination:{limit:25,offset:0}},{async query(sql,params){paginated={sql,params};return [[]];}});
 const {csv,filename}=await service.getTicketCsvExport({search:'wifi',status:'OPEN',sortBy:'title',sortOrder:'asc'},{async query(options,params){
  assert.equal(options.timezone,'Z');
  assert.equal(options.sql,paginated.sql.replace(' LIMIT ? OFFSET ?',''));
  assert.deepEqual(params,paginated.params.slice(0,-2));
  return [Array.from({length:125},(_,i)=>({ticket_number:`SF-${i}`,title:'=SUM(A1)',status:'OPEN',category_name:'Hardware',priority_name:'HIGH',requester_first_name:' Alice ',requester_last_name:' User ',requester_email:'a@example.test',assigned_to:null,created_at:new Date('2026-09-10T06:30:00Z'),password:'secret'}))];
 }});
 assert.equal(csv.split('\r\n').length,127);
 assert.ok(csv.includes('"SF-124"'));
 assert.ok(csv.includes('"\'=SUM(A1)"'));
 assert.ok(csv.includes('"Alice User","a@example.test","","","2026-09-10T06:30:00.000Z","","","",""'));
 assert.ok(!csv.includes('secret'));
 assert.equal(csv.split('\r\n')[0].split(',').length,14);
 assert.match(filename,/^supportflow-tickets-\d{4}-\d{2}-\d{2}\.csv$/);
 for(const params of [{page:'1'},{limit:'25'},{filename:'x'},{downloadName:'x'},{startDate:'2026-02-30'},{sortBy:'id'},{technicianId:'0'}]) assert.throws(()=>normalizeTicketCsvQuery(params),{statusCode:422});
});
test('CSV route is ADMIN-only, returns headers for empty datasets and keeps errors JSON',async t=>{
 const vars=['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_ACCESS_SECRET'];
 const saved=vars.map(k=>process.env[k]);vars.forEach(k=>process.env[k]='csv-test');
 t.after(()=>vars.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];}));
 const app=require('../src/app');
 t.mock.method(users,'findById',async id=>({id,role:{1:'EMPLOYEE',2:'TECHNICIAN',3:'ADMIN'}[id],is_active:1}));
 const query=t.mock.method(pool,'query',async()=>[[]]);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const get=(actor,suffix='')=>fetch(`http://127.0.0.1:${server.address().port}/api/v1/reports/tickets/export/csv${suffix}`,{headers:actor?{authorization:`Bearer ${jwt.sign({},process.env.JWT_ACCESS_SECRET,{subject:String(actor),expiresIn:'5m'})}`}:{}});
 assert.equal((await get(null)).status,401);for(const id of [1,2])assert.equal((await get(id)).status,403);
 for(const suffix of ['?page=1','?limit=25','?filename=x','?status=INVALID']) {const response=await get(3,suffix);assert.equal(response.status,422);assert.match(response.headers.get('content-type'),/application\/json/);}
 assert.equal(query.mock.callCount(),0);
 const response=await get(3,'?search=wifi&sortOrder=asc');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);assert.match(response.headers.get('content-disposition'),/attachment; filename="supportflow-tickets-/);
 const csv=Buffer.from(await response.arrayBuffer()).toString('utf8');assert.ok(csv.startsWith('\uFEFF"Ticket Number"'));assert.equal(csv.split('\r\n').length,2);
 t.mock.method(pool,'query',async()=>{throw new Error('sensitive SQL');});const failure=await get(3);assert.equal(failure.status,500);assert.equal(failure.headers.get('content-disposition'),null);assert.equal((await failure.json()).message,'Internal server error');
});
