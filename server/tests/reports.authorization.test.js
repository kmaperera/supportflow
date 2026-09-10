const {test}=require('node:test');
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const pool=require('../src/config/database');
const users=require('../src/modules/users/user.repository');
const service=require('../src/modules/reports/reports.service');
const csvService=require('../src/modules/reports/reports.csv');
const analytics=require('../src/modules/reports/reports.analyticsPdf');
const csv=require('../src/utils/csv');
const pdf=require('../src/utils/pdf');
const paths=['tickets','date-range','technician-performance','sla','categories','priorities','statuses'];
const routes=[...paths,...paths.map(p=>`${p}/export/csv`),'tickets/export/pdf','analytics/export/pdf'];
test('all reports reject unauthorized credentials before validation, report reads or generation',async t=>{
 const vars=['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'];const saved=vars.map(k=>process.env[k]);vars.forEach(k=>process.env[k]='authorization-review');t.after(()=>vars.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];}));
 const spies=[];
 for(const object of [service,csvService,analytics]) for(const key of Object.keys(object)) if(typeof object[key]==='function') spies.push(t.mock.method(object,key,async()=>{throw new Error('Report service reached');}));
 spies.push(t.mock.method(pool,'query',async()=>{throw new Error('Report SQL reached');}));
 spies.push(t.mock.method(csv,'generateCsv',()=>{throw new Error('CSV generation reached');}));
 spies.push(t.mock.method(pdf,'generatePdfReport',()=>{throw new Error('PDF generation reached');}));
 t.mock.method(users,'findById',async id=>id==='6'?null:{id,role:{1:'EMPLOYEE',2:'TECHNICIAN',3:'ADMIN',4:'ADMIN',5:'EMPLOYEE',7:'UNKNOWN'}[id],is_active:id==='4'?0:1});
 const app=require('../src/app');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const sign=(id,payload={},secret=process.env.JWT_ACCESS_SECRET,expiresIn='5m')=>jwt.sign(payload,secret,{subject:String(id),expiresIn});
 const attempts=[[null,401],['Bearer malformed',401],[`Bearer ${sign(3,{},'wrong-secret')}`,401],[`Bearer ${sign(3,{},undefined,-1)}`,401],[`Bearer ${sign(3,{type:'refresh'})}`,401],[`Bearer ${sign(1,{role:'ADMIN'})}`,403],[`Bearer ${sign(2)}`,403],[`Bearer ${sign(4)}`,403],[`Bearer ${sign(5,{role:'ADMIN'})}`,403],[`Bearer ${sign(6)}`,401],[`Bearer ${sign(7)}`,403]];
 for(const route of routes) for(const [authorization,code] of attempts){
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/reports/${route}?role=ADMIN&userRole=ADMIN&isAdmin=true&userId=3&technicianId=2&startDate=invalid`,{headers:authorization?{authorization}:{}});
  assert.equal(response.status,code,route);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(response.headers.get('content-disposition'),null);
  const body=await response.json();assert.equal(body.success,false);assert.ok(Array.isArray(body.errors));
 }
 // Valid ADMIN still passes auth but invalid client-controlled export options fail
 // validation before report data or generators are invoked.
 for(const route of routes){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/reports/${route}?filePath=x&filename=x`,{headers:{authorization:`Bearer ${sign(3)}`}});assert.equal(response.status,422);assert.equal(response.headers.get('content-disposition'),null);}
 for(const spy of spies)assert.equal(spy.mock.callCount(),0);
});
