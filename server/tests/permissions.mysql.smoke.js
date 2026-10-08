// Local-only integration smoke. Creates disposable records and deletes only IDs
// allocated by this run. Never uploads files or contacts a production endpoint.
require('dotenv').config({ quiet: true });
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const pool=require('../src/config/database');
const {hashPassword}=require('../src/utils/password');
const run=randomUUID().replaceAll('-','');
const created={users:[],tickets:[],article:null,category:null};
let server;
async function insert(sql,values){const[result]=await pool.query(sql,values);return result.insertId;}
async function main(){
 if(process.env.NODE_ENV==='production'||!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw new Error('Requires a local non-production database');
 process.env.NODE_ENV='test';
 const password=`Fixture-${randomUUID()}!`;
 const hash=await hashPassword(password);
 for(const role of ['EMPLOYEE','EMPLOYEE','TECHNICIAN','TECHNICIAN','ADMIN']){
  const email=`idor-${run}-${created.users.length}@example.invalid`;
  const id=await insert('INSERT INTO users (first_name,last_name,email,password_hash,role,is_active,must_change_password) VALUES (?, ?, ?, ?, ?, TRUE, FALSE)',['IDOR','Fixture',email,hash,role]);
  created.users.push({id,email,role});
 }
 const [categories]=await pool.query('SELECT id FROM ticket_categories WHERE is_active = TRUE LIMIT 1');
 const [priorities]=await pool.query('SELECT id FROM ticket_priorities WHERE is_active = TRUE LIMIT 1');
 assert.ok(categories[0]&&priorities[0],'Seed active category/priority before running this smoke');
 for(let i=0;i<4;i++){
  const owner=created.users[i%2].id;const technician=i<2?null:created.users[i===2?2:3].id;
  const id=await insert('INSERT INTO tickets (ticket_number,created_by,category_id,priority_id,assigned_to,title,description,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',[`IDOR-${run.slice(0,16)}-${i}`,owner,categories[0].id,priorities[0].id,technician,`Fixture ${run}`,'Private fixture text',technician?'IN_PROGRESS':'OPEN']);
  created.tickets.push(id);
  if(technician)await insert('INSERT INTO ticket_assignments (ticket_id,technician_id,assigned_by,assignment_type) VALUES (?, ?, ?, ?)',[id,technician,created.users[4].id,'ADMIN']);
 }
 const comment=await insert('INSERT INTO ticket_comments (ticket_id,user_id,comment_type,content) VALUES (?, ?, ?, ?)',[created.tickets[3],created.users[1].id,'PUBLIC','Private fixture comment']);
 const attachment=await insert('INSERT INTO ticket_attachments (ticket_id,uploaded_by,original_name,public_id,file_url,resource_type,delivery_type,mime_type,file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',[created.tickets[3],created.users[1].id,'fixture.txt',`fixture-${run}`,'https://example.invalid/not-a-real-asset','raw','authenticated','text/plain',1]);
 const notification=await insert('INSERT INTO notifications (user_id,type,title,message) VALUES (?, ?, ?, ?)',[created.users[1].id,'TICKET_CREATED','Private fixture notification','Private fixture text']);
 created.category=await insert('INSERT INTO knowledge_base_categories (name,is_active) VALUES (?, TRUE)',[`IDOR ${run}`]);
 created.article=await insert('INSERT INTO knowledge_base_articles (category_id,title,slug,content,status,created_by) VALUES (?, ?, ?, ?, ?, ?)',[created.category,'Private fixture draft',`idor-${run}`,'Private draft text','DRAFT',created.users[4].id]);
 // Authorization must reject before these boundaries. Protect this smoke from
 // accidental provider requests even if a regression is discovered.
 const storage=require('../src/services/cloudinaryUpload.service');
 let providerCalls=0;
 storage.uploadAttachmentBuffer=storage.deleteCloudinaryAsset=async()=>{providerCalls++;throw new Error('Unexpected provider access');};
 require('../src/services/attachmentDownload.service').fetchAttachment=async()=>{providerCalls++;throw new Error('Unexpected provider access');};
 server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 for(const user of created.users){const response=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password})});assert.equal(response.status,200);user.token=(await response.json()).data.accessToken;}
 let checks=0;
 async function check(actor,method,path,status,body){
  const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${created.users[actor].token}`,...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const text=await response.text();assert.equal(response.status,status,`${method} ${path}`);
  if(status>=400)assert.doesNotMatch(text,/Private fixture|Private draft|example.invalid\/not-a-real-asset/);
  assert.equal(response.headers.get('location'),null);checks++;return JSON.parse(text);
 }
 const own=created.tickets[0],other=created.tickets[1],assignedOther=created.tickets[3];
 await check(0,'GET',`/tickets/${own}`,200);await check(0,'GET',`/tickets/${other}`,404);
 for(const [method,suffix,body]of[['PATCH','',{title:'Attempted fixture edit'}],['POST','/comments',{content:'Attempted fixture reply'}],['POST','/attachments'],['PATCH','/close',{}],['PATCH','/reopen',{}]])await check(0,method,`/tickets/${other}${suffix}`,404,body);
 for(const [method,suffix,body]of[['PATCH','/status',{status:'WAITING_FOR_USER'}],['PATCH','/priority',{priorityId:priorities[0].id}],['PATCH','/resolve',{resolutionSummary:'Attempted fixture resolution'}],['POST','/internal-notes',{content:'Attempted internal fixture'}]])await check(2,method,`/tickets/${assignedOther}${suffix}`,404,body);
 await check(0,'POST',`/tickets/${own}/internal-notes`,403,{content:'Attempted internal fixture'});
 for(const actor of [0,2])for(const [method,path,body]of[['GET','/users'],['PATCH',`/users/${created.users[1].id}/role`,{role:'ADMIN'}],['PATCH',`/users/${created.users[1].id}/status`,{isActive:false}],['PATCH','/sla/policies/1',{responseTimeMinutes:1,resolutionTimeMinutes:2}],['POST','/tickets/admin/categories',{name:'Attempted fixture'}],['GET','/audit-logs'],['GET','/reports/tickets/export/csv'],['GET','/reports/tickets/export/pdf'],['GET','/dashboard/admin/summary']])await check(actor,method,path,403,body);
 for(const actor of [0,4])await check(actor,'PATCH',`/notifications/${notification}/read`,404);
 await check(0,'GET',`/tickets/${assignedOther}/attachments/${attachment}/download`,404);
 await check(4,'GET',`/tickets/${own}/attachments/${attachment}/download`,404);
 await check(4,'POST',`/tickets/${own}/comments/${comment}/attachments`,404);
 await check(0,'GET',`/knowledge-base/articles/${created.article}`,404);await check(2,'GET',`/knowledge-base/articles/${created.article}`,404);await check(4,'GET',`/knowledge-base/articles/${created.article}`,200);
 const mine=await check(0,'GET','/tickets/my?search=Fixture',200);assert.equal(mine.pagination.totalRecords,2);assert.equal(mine.data.tickets.length,2);assert.ok(mine.data.tickets.every(row=>String(row.createdBy)===String(created.users[0].id)));
 await check(2,'GET',`/tickets/queue?assignedTo=${created.users[3].id}`,200).then(result=>{assert.equal(result.pagination.totalRecords,0);assert.deepEqual(result.data.tickets,[]);});
 const [unchanged]=await pool.query('SELECT is_read FROM notifications WHERE id = ?',[notification]);assert.equal(unchanged[0].is_read,0);assert.equal(providerCalls,0);
 console.log(JSON.stringify({result:'PASS',checks,fixtureUserIds:created.users.map(u=>u.id),fixtureTicketIds:created.tickets,attachmentId:attachment,commentId:comment,notificationId:notification,articleId:created.article,providerCalls}));
}
async function cleanup(){
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(created.article)await pool.query('DELETE FROM knowledge_base_articles WHERE id = ? AND slug = ?',[created.article,`idor-${run}`]);
 if(created.category)await pool.query('DELETE FROM knowledge_base_categories WHERE id = ? AND name = ?',[created.category,`IDOR ${run}`]);
 for(const id of created.tickets)await pool.query('DELETE FROM tickets WHERE id = ? AND title = ?',[id,`Fixture ${run}`]);
 for(const user of created.users){
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?',[user.id]);
  await pool.query('DELETE FROM users WHERE id = ? AND email = ?',[user.id,user.email]);
 }
 console.log('Disposable fixture records cleaned up.');
}
main().catch(error=>{console.error(`Permission smoke failed: ${error.code||error.name}`);process.exitCode=1;}).finally(async()=>{try{await cleanup();}catch{console.error('Fixture cleanup failed; inspect only this run\'s allocated IDs.');process.exitCode=1;}await pool.end();});
