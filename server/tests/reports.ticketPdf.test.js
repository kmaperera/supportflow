const {test}=require('node:test');
const assert=require('node:assert/strict');
const service=require('../src/modules/reports/reports.service');
const PDFDocument=require('pdfkit');
const pool=require('../src/config/database');
const users=require('../src/modules/users/user.repository');
const jwt=require('jsonwebtoken');
test('Ticket PDF exports all rows with shared CSV query and safe readable layout',async t=>{
 const texts=[];const original=PDFDocument.prototype.text;
 t.mock.method(PDFDocument.prototype,'text',function(text,...args){texts.push(String(text));return original.call(this,text,...args);});
 let csvQuery;await service.getTicketCsvExport({search:'wifi',sortBy:'title',sortOrder:'asc'},{async query(options,params){csvQuery={options,params};return [[]];}});
 const {pdfBuffer,filename}=await service.getTicketPdfExport({search:'wifi',sortBy:'title',sortOrder:'asc'},{async query(options,params){assert.deepEqual({options,params},csvQuery);assert.doesNotMatch(options.sql,/LIMIT|OFFSET|ticket_status_history|ticket_assignments/);return [Array.from({length:125},(_,i)=>({ticket_number:`SF-${i}`,title:'=Plain <script>text</script> '+ 'wrapped title '.repeat(8),status:'WAITING_FOR_USER',category_name:'Hardware',priority_name:'HIGH',requester_first_name:' Alice ',requester_last_name:' User ',assigned_to:null,created_at:new Date('2026-09-10T06:30:00Z'),first_response_at:null,resolved_at:null,password:'secret'}))];}});
 assert.ok(pdfBuffer.subarray(0,5).equals(Buffer.from('%PDF-')));
 assert.match(filename,/^supportflow-ticket-report-\d{4}-\d{2}-\d{2}\.pdf$/);
 assert.equal(texts.filter(s=>/^SF-\d+$/.test(s)).length,125);
 assert.ok(texts.includes('SF-124'));assert.ok(texts.includes('2026-09-10 06:30 UTC'));assert.ok(texts.includes('Alice User'));
 assert.ok(texts.some(s=>s.startsWith('=Plain <script>')));assert.ok(!texts.includes('secret'));
 assert.ok(texts.filter(s=>s==='Ticket Number').length>1);
 assert.match(pdfBuffer.toString('latin1'),/\/MediaBox \[0 0 841.89 595.28\]/);
});
test('Ticket PDF route enforces ADMIN, rejects pagination, returns empty PDF and JSON errors',async t=>{
 const vars=['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_ACCESS_SECRET'];const saved=vars.map(k=>process.env[k]);vars.forEach(k=>process.env[k]='ticket-pdf-test');t.after(()=>vars.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];}));
 const app=require('../src/app');t.mock.method(users,'findById',async id=>({id,role:{1:'EMPLOYEE',2:'TECHNICIAN',3:'ADMIN'}[id],is_active:1}));const query=t.mock.method(pool,'query',async()=>[[]]);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const get=(id,suffix='')=>fetch(`http://127.0.0.1:${server.address().port}/api/v1/reports/tickets/export/pdf${suffix}`,{headers:id?{authorization:`Bearer ${jwt.sign({},process.env.JWT_ACCESS_SECRET,{subject:String(id),expiresIn:'5m'})}`}:{}});
 for(const [id,status] of [[null,401],[1,403],[2,403]]){const r=await get(id);assert.equal(r.status,status);assert.match(r.headers.get('content-type'),/json/);}
 for(const suffix of ['?page=1','?limit=25','?title=x','?filename=x','?startDate=2026-02-30','?status=INVALID','?technicianId=0','?sortBy=id','?sortOrder=oops']){const r=await get(3,suffix);assert.equal(r.status,422);assert.equal(r.headers.get('content-disposition'),null);}
 assert.equal(query.mock.callCount(),0);
 const r=await get(3);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(r.headers.get('content-disposition'),/^attachment; filename="supportflow-ticket-report-/);assert.ok(Buffer.from(await r.arrayBuffer()).subarray(0,5).equals(Buffer.from('%PDF-')));
 t.mock.method(pool,'query',async()=>{throw new Error('sensitive SQL');});const failure=await get(3);assert.equal(failure.status,500);assert.equal(failure.headers.get('content-disposition'),null);assert.equal((await failure.json()).message,'Internal server error');
});
