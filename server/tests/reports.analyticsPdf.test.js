const {test}=require('node:test');
const assert=require('node:assert/strict');
const service=require('../src/modules/reports/reports.service');
const PDFDocument=require('pdfkit');
const pool=require('../src/config/database');
const users=require('../src/modules/users/user.repository');
const jwt=require('jsonwebtoken');
const analytics=require('../src/modules/reports/reports.analyticsPdf');
test('analytics reuses five services and derives overview while preserving metric values',async t=>{
 const texts=[];const original=PDFDocument.prototype.text;t.mock.method(PDFDocument.prototype,'text',function(text,...args){texts.push(String(text));return original.call(this,text,...args);});
 const statuses=['OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED','REOPENED'].map((status,i)=>({status,totalTickets:i+1,percentageOfTickets:3.57}));
 const data={getStatusReport:{totalTickets:28,statuses},getCategoryReport:{categories:[]},getPriorityReport:{priorities:[]},getSlaReport:{responseSla:{compliancePercentage:null},resolutionSla:{compliancePercentage:83.33}},getTechnicianPerformanceReport:{technicians:[{technicianName:'Inactive Tech',isActive:false,assignedTickets:0,resolvedTickets:0,averageFirstResponseMinutes:null,averageResolutionMinutes:34.5,responseSlaCompliancePercentage:null,resolutionSlaCompliancePercentage:75}]}};
 for(const [method,report] of Object.entries(data))t.mock.method(service,method,async filters=>{assert.deepEqual(filters,{startDate:'2026-09-01',endDate:'2026-09-09'});return {report};});
 const {pdfBuffer,filename}=await analytics.getAnalyticsPdfExport({startDate:'2026-09-01',endDate:'2026-09-09'});
 assert.equal(pdfBuffer.subarray(0,5).toString(),'%PDF-');assert.match(filename,/supportflow-analytics-report-/);
 for(const value of ['Overview','SLA Performance','Status Distribution','Category Distribution','Priority Distribution','Technician Performance','28','17','83.33%','34.5','Inactive Tech','Report Period: 2026-09-01 to 2026-09-09'])assert.ok(texts.includes(value),value);
 assert.equal((pdfBuffer.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,6);
 for(const method of Object.keys(data))assert.equal(service[method].mock.callCount(),1);
});
test('Analytics PDF route enforces ADMIN, rejects pagination, returns empty PDF and JSON errors',async t=>{
 const vars=['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_ACCESS_SECRET'];const saved=vars.map(k=>process.env[k]);vars.forEach(k=>process.env[k]='ticket-pdf-test');t.after(()=>vars.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];}));
 const app=require('../src/app');t.mock.method(users,'findById',async id=>({id,role:{1:'EMPLOYEE',2:'TECHNICIAN',3:'ADMIN'}[id],is_active:1}));const query=t.mock.method(pool,'query',async sql=>sql.includes('response_tracked')?[[{}]]:[[]]);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const get=(id,suffix='')=>fetch(`http://127.0.0.1:${server.address().port}/api/v1/reports/analytics/export/pdf${suffix}`,{headers:id?{authorization:`Bearer ${jwt.sign({},process.env.JWT_ACCESS_SECRET,{subject:String(id),expiresIn:'5m'})}`}:{}});
 for(const [id,status] of [[null,401],[1,403],[2,403]]){const r=await get(id);assert.equal(r.status,status);assert.match(r.headers.get('content-type'),/json/);}
 for(const suffix of ['?page=1','?limit=25','?title=x','?filename=x','?startDate=2026-02-30','?status=INVALID','?technicianId=0','?sortBy=id','?sortOrder=oops']){const r=await get(3,suffix);assert.equal(r.status,422);assert.equal(r.headers.get('content-disposition'),null);}
 assert.equal(query.mock.callCount(),0);
 const r=await get(3);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(r.headers.get('content-disposition'),/^attachment; filename="supportflow-analytics-report-/);assert.ok(Buffer.from(await r.arrayBuffer()).subarray(0,5).equals(Buffer.from('%PDF-')));
 t.mock.method(pool,'query',async()=>{throw new Error('sensitive SQL');});const failure=await get(3);assert.equal(failure.status,500);assert.equal(failure.headers.get('content-disposition'),null);assert.equal((await failure.json()).message,'Internal server error');
});
