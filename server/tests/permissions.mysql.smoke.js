// Local-only authorization regression. All allocated fixtures/mutations roll back.
// Provider boundaries are guarded; no external upload or delivery is attempted.
require('dotenv').config({ quiet: true });
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const pool=require('../src/config/database');
const {hashPassword}=require('../src/utils/password');
const run=randomUUID().replaceAll('-','');
const created={users:[],tickets:[],article:null,category:null};
let server;
let io;
let fixtureConnection;
const originalPool={query:pool.query,execute:pool.execute,getConnection:pool.getConnection};
async function insert(sql,values){const[result]=await pool.query(sql,values);return result.insertId;}
async function main(){
 if(process.env.NODE_ENV==='production'||!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw new Error('Requires a local non-production database');
 process.env.NODE_ENV='test';
 fixtureConnection=await pool.getConnection();
 await fixtureConnection.beginTransaction();
 let sequence=0;const savepoints=[];
 const db={query:(...args)=>fixtureConnection.query(...args),execute:(...args)=>fixtureConnection.execute(...args),
  async beginTransaction(){const name=`idor_fixture_${++sequence}`;await fixtureConnection.query(`SAVEPOINT ${name}`);savepoints.push(name);},
  async commit(){await fixtureConnection.query(`RELEASE SAVEPOINT ${savepoints.pop()}`);},
  async rollback(){if(savepoints.length){const name=savepoints.pop();await fixtureConnection.query(`ROLLBACK TO SAVEPOINT ${name}`);await fixtureConnection.query(`RELEASE SAVEPOINT ${name}`);}},
  release(){},destroy(){throw new Error('Fixture connection must remain open');}};
 // Include newly instrumented LOGIN_SUCCESS rows in the same rollback scope.
 pool.query=db.query;pool.execute=db.execute;pool.getConnection=async()=>db;
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
 const inactiveCategory=await insert('INSERT INTO ticket_categories (name,is_active) VALUES (?, FALSE)',[`Inactive authorization ${run}`]);
 for(let i=0;i<4;i++){
  const owner=created.users[i%2].id;const technician=i<2?null:created.users[i===2?2:3].id;
  const id=await insert('INSERT INTO tickets (ticket_number,created_by,category_id,priority_id,assigned_to,title,description,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',[`IDOR-${run.slice(0,16)}-${i}`,owner,categories[0].id,priorities[0].id,technician,`Fixture ${run}`,'Private fixture text',technician?'IN_PROGRESS':'OPEN']);
  created.tickets.push(id);
  if(technician)await insert('INSERT INTO ticket_assignments (ticket_id,technician_id,assigned_by,assignment_type) VALUES (?, ?, ?, ?)',[id,technician,created.users[4].id,'ADMIN']);
 }
 const comment=await insert('INSERT INTO ticket_comments (ticket_id,user_id,comment_type,content) VALUES (?, ?, ?, ?)',[created.tickets[3],created.users[1].id,'PUBLIC','Private fixture comment']);
 const attachment=await insert('INSERT INTO ticket_attachments (ticket_id,uploaded_by,original_name,public_id,file_url,resource_type,delivery_type,mime_type,file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',[created.tickets[3],created.users[1].id,'fixture.txt',`fixture-${run}`,'https://example.invalid/not-a-real-asset','raw','authenticated','text/plain',1]);
 const notification=await insert('INSERT INTO notifications (user_id,type,title,message) VALUES (?, ?, ?, ?)',[created.users[1].id,'TICKET_CREATED','Private fixture notification','Private fixture text']);
 const personal=[];
 for(const user of created.users)personal.push(await insert('INSERT INTO notifications (user_id,type,title,message) VALUES (?, ?, ?, ?)',[user.id,'TICKET_CREATED','Recipient fixture','Private recipient text']));
 const internalNote=await insert('INSERT INTO ticket_comments (ticket_id,user_id,comment_type,content) VALUES (?, ?, ?, ?)',[created.tickets[2],created.users[2].id,'INTERNAL','Private internal fixture note']);
 const internalAttachment=await insert('INSERT INTO ticket_attachments (ticket_id,comment_id,uploaded_by,original_name,public_id,file_url,resource_type,delivery_type,mime_type,file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',[created.tickets[2],internalNote,created.users[2].id,'internal-fixture.txt',`internal-fixture-${run}`,'https://example.invalid/not-a-real-asset','raw','authenticated','text/plain',1]);
 created.category=await insert('INSERT INTO knowledge_base_categories (name,is_active) VALUES (?, TRUE)',[`IDOR ${run}`]);
 created.article=await insert('INSERT INTO knowledge_base_articles (category_id,title,slug,content,status,created_by) VALUES (?, ?, ?, ?, ?, ?)',[created.category,'Private fixture draft',`idor-${run}`,'Private draft text','DRAFT',created.users[4].id]);
 // Authorization must reject before these boundaries. Protect this smoke from
 // accidental provider requests even if a regression is discovered.
 const storage=require('../src/services/cloudinaryUpload.service');
 let providerCalls=0;
 storage.uploadAttachmentBuffer=storage.deleteCloudinaryAsset=async()=>{providerCalls++;throw new Error('Unexpected provider access');};
 require('../src/services/attachmentDownload.service').fetchAttachment=async()=>{providerCalls++;throw new Error('Unexpected provider access');};
 // Notifications generated by permitted assignment mutations retain normal
 // realtime initialization, without opening test clients or external providers.
 server=require('node:http').createServer(require('../src/app'));
 io=require('../src/config/socket').initializeSocket(server);
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 for(const user of created.users){const response=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password})});assert.equal(response.status,200);user.token=(await response.json()).data.accessToken;user.cookie=response.headers.get('set-cookie').split(';')[0];}
 let checks=0;
 async function check(actor,method,path,status,body){
  const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${created.users[actor].token}`,...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const text=await response.text();assert.equal(response.status,status,`${method} ${path}`);
  assert.match(response.headers.get('content-type'),/application\/json/);
  const result=JSON.parse(text);assert.equal(result.success,status<400);
  if(status>=400)assert.ok(Array.isArray(result.errors));
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
 // Final role regression: successful shared capabilities plus scoped rows/counts.
 for(let actor=0;actor<5;actor++){
  const me=await check(actor,'GET',`/auth/me?userId=${created.users[(actor+1)%5].id}`,200);
  assert.equal(String(me.data.user.id),String(created.users[actor].id));
  const active=await check(actor,'GET','/tickets/categories',200);assert.ok(!active.data.categories.some(row=>String(row.id)===String(inactiveCategory)));
  await check(actor,'GET','/tickets/priorities',200);
  await check(actor,'GET',`/tickets/${actor===1||actor===3?created.tickets[3]:created.tickets[2]}/status-history`,200);
  await check(actor,'GET',`/tickets/${actor===1||actor===3?created.tickets[3]:created.tickets[2]}/assignment-history`,200);
  await check(actor,'PATCH','/auth/change-password',422,{userId:created.users[(actor+1)%5].id,currentPassword:password,newPassword:'SyntheticFixture123!',confirmPassword:'SyntheticFixture123!'});
  const notices=await check(actor,'GET','/notifications',200);
  assert.ok(notices.data.notifications.every(row=>String(row.userId)===String(created.users[actor].id)));
  assert.equal(notices.data.pagination.total,actor===1?2:1);
  for(let owner=0;owner<5;owner++)await check(actor,'PATCH',`/notifications/${personal[owner]}/read`,actor===owner?200:404);
 }
 for(const actor of [0,1]){
  const mine=await check(actor,'GET',`/tickets/my?search=${run}&page=1&limit=1`,200);
  assert.equal(mine.pagination.totalRecords,2);assert.equal(mine.data.tickets.length,1);
  assert.ok(mine.data.tickets.every(row=>String(row.createdBy)===String(created.users[actor].id)));
  const summary=await check(actor,'GET','/dashboard/employee/summary',200);assert.equal(summary.data.summary.totalTickets,2);
  const stats=await check(actor,'GET','/dashboard/status-distribution',200);assert.equal(stats.data.distribution.reduce((total,row)=>total+row.count,0),2);
  for(const key of ['requesterId','technicianId','userId'])await check(actor,'GET',`/tickets/my?${key}=${created.users[1].id}`,422);
 }
 for(const actor of [2,3]){
  const mine=await check(actor,'GET',`/tickets/assigned-to-me?search=${run}`,200);assert.equal(mine.pagination.totalRecords,1);
  assert.ok(mine.data.tickets.every(row=>String(row.assignedTo)===String(created.users[actor].id)));
  const queue=await check(actor,'GET',`/tickets/queue?search=${run}`,200);assert.equal(queue.pagination.totalRecords,3);
  assert.ok(queue.data.tickets.every(row=>row.assignedTo==null||String(row.assignedTo)===String(created.users[actor].id)));
  const summary=await check(actor,'GET','/dashboard/technician/summary',200);assert.equal(summary.data.summary.activeAssignedTickets,1);
  const stats=await check(actor,'GET','/dashboard/status-distribution',200);assert.equal(stats.data.distribution.reduce((total,row)=>total+row.count,0),1);
  const otherQueue=await check(actor,'GET',`/tickets/queue?search=${run}&assignedTo=${created.users[actor===2?3:2].id}`,200);assert.equal(otherQueue.pagination.totalRecords,0);
  await check(actor,'GET',`/tickets/assigned-to-me?technicianId=${created.users[actor===2?3:2].id}`,422);
 }
 const globalQueue=await check(4,'GET',`/tickets/queue?search=${run}`,200);assert.equal(globalQueue.pagination.totalRecords,4);
 const managedCategories=await check(4,'GET','/tickets/admin/categories',200);assert.ok(managedCategories.data.categories.some(row=>String(row.id)===String(inactiveCategory)&&row.isActive===false));
 for(const id of created.tickets)await check(4,'GET',`/tickets/${id}`,200);
 // Internal content is hidden even on the Employee's own assigned ticket.
 for(const actor of [0,2,4]){
  const notes=await check(actor,'GET',`/tickets/${created.tickets[2]}/comments`,200);
  assert.equal(notes.data.comments.some(row=>String(row.id)===String(internalNote)),actor!==0);
  const files=await check(actor,'GET',`/tickets/${created.tickets[2]}/attachments`,200);
  assert.equal(files.data.attachments.some(row=>String(row.id)===String(internalAttachment)),actor!==0);
 }
 await check(0,'GET',`/tickets/${created.tickets[2]}/attachments/${internalAttachment}/download`,404);
 await check(0,'POST',`/tickets/${created.tickets[2]}/comments/${internalNote}/attachments`,404);
 await check(2,'POST',`/tickets/${assignedOther}/comments`,404,{content:'Harmless denied reply'});
 await check(2,'POST',`/tickets/${assignedOther}/attachments`,404);
 await check(2,'GET',`/tickets/${assignedOther}/attachments/${attachment}/download`,404);
 await check(0,'PUT',`/tickets/${other}/feedback`,404,{rating:5});
 await check(0,'GET',`/tickets/${other}/status-history`,404);await check(0,'GET',`/tickets/${other}/assignment-history`,404);
 for(const actor of [0,2]){
  for(const [method,path,body]of[
   ['GET','/tickets/assigned-to-me'],['POST',`/tickets/${own}/self-assign`,{}],
   ['PATCH',`/tickets/${own}/assign`,{technicianId:created.users[3].id}],['PATCH',`/tickets/${own}/unassign`,{expectedAssignmentId:1}],
   ['POST','/users',{firstName:'Denied',lastName:'Fixture',email:'synthetic@example.invalid',password,role:'EMPLOYEE'}],
   ['PATCH',`/users/${created.users[1].id}`,{role:'ADMIN',isActive:true}],
   ['POST','/knowledge-base/articles',{categoryId:created.category,title:'Denied fixture article',content:'Denied fixture content'}],
   ['PATCH',`/knowledge-base/articles/${created.article}`,{title:'Denied fixture title'}],
   ['PATCH',`/knowledge-base/articles/${created.article}/publish`,{}],['PATCH',`/knowledge-base/articles/${created.article}/archive`,{}],
   ['GET','/dashboard/technician-workload'],['GET','/users?role=ADMIN&isActive=true']
  ]){
   // Assigned-to-me and self-assignment are legitimate Technician operations.
   if(actor===2&&(path==='/tickets/assigned-to-me'||path.endsWith('/self-assign')))continue;
   await check(actor,method,path,403,body);
  }
 }
 await check(0,'GET','/tickets/queue',403);await check(0,'GET','/dashboard/technician/summary',403);
 await check(0,'PATCH',`/tickets/${own}/status`,403,{status:'IN_PROGRESS'});await check(0,'PATCH',`/tickets/${own}/priority`,403,{priorityId:priorities[0].id});
 await check(2,'POST',`/tickets/${own}/self-assign`,422,{technicianId:created.users[3].id});
 for(const injection of [{role:'ADMIN'},{isActive:true},{requesterId:created.users[1].id},{assignedTechnicianId:created.users[3].id},{status:'CLOSED'},{priority:priorities[0].id}]){
  await check(0,'POST','/tickets',422,{categoryId:categories[0].id,priorityId:priorities[0].id,title:'Harmless fixture title',description:'Harmless fixture description',...injection});
  await check(0,'PATCH',`/tickets/${own}`,422,injection);
 }
 // priorityId is intentionally editable by an Employee on their own OPEN or
 // ASSIGNED ticket; reject aliases/injected identities, not that valid field.
 await check(0,'PATCH',`/tickets/${own}`,200,{priorityId:priorities[0].id});
 const [otherAssignment]=await pool.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL',[assignedOther]);
 await check(4,'PATCH',`/tickets/${created.tickets[2]}/unassign`,409,{expectedAssignmentId:otherAssignment[0].id});
 const [beforeAssign]=await pool.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL',[own]);
 await check(4,'PATCH',`/tickets/${own}/assign`,200,{technicianId:created.users[2].id,expectedAssignmentId:beforeAssign[0]?.id ?? null});
 const [beforeReassign]=await pool.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL',[own]);
 await check(4,'PATCH',`/tickets/${own}/assign`,200,{technicianId:created.users[3].id,expectedAssignmentId:beforeReassign[0].id});
 const [currentAssignment]=await pool.execute('SELECT id FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL',[own]);
 await check(4,'PATCH',`/tickets/${own}/unassign`,200,{expectedAssignmentId:currentAssignment[0].id});
 await check(4,'PATCH',`/users/${created.users[4].id}/role`,400,{role:'EMPLOYEE'});
 await check(4,'PATCH',`/users/${created.users[4].id}/status`,400,{isActive:false});
 await check(4,'PATCH',`/users/${created.users[0].id}`,422,{role:'ADMIN',isActive:false});
 for(const state of ['DRAFT','PUBLISHED','ARCHIVED']){
  await pool.execute('UPDATE knowledge_base_articles SET status=? WHERE id=?',[state,created.article]);
  for(const actor of [0,2,4])await check(actor,'GET',`/knowledge-base/articles/${created.article}`,actor===4||state==='PUBLISHED'?200:404);
 }
 // Only auth-specific role/activity regression, not a full account workflow.
 await check(4,'PATCH',`/users/${created.users[1].id}/role`,200,{role:'TECHNICIAN'});
 assert.equal((await check(1,'GET','/auth/me',200)).data.user.role,'TECHNICIAN');
 await check(1,'GET','/tickets/queue',200);
 const stale=await fetch(base+'/auth/refresh',{method:'POST',headers:{cookie:created.users[1].cookie}});assert.equal(stale.status,401);
 await check(4,'PATCH',`/users/${created.users[1].id}/status`,200,{isActive:false});
 await check(1,'GET','/auth/me',403);
 assert.equal(providerCalls,0);
 console.log(JSON.stringify({result:'PASS',checks,fixtureUserIds:created.users.map(u=>u.id),fixtureTicketIds:created.tickets,attachmentId:attachment,commentId:comment,notificationId:notification,articleId:created.article,providerCalls}));
}
async function cleanup(){
 if(server)server.closeAllConnections();
 if(io)await new Promise(r=>io.close(r));else if(server)await new Promise(r=>server.close(r));
 pool.query=originalPool.query;pool.execute=originalPool.execute;pool.getConnection=originalPool.getConnection;
 if(fixtureConnection){try{
  await fixtureConnection.rollback();
  if(created.users.length)for(const [table,column]of[['users','id'],['tickets','created_by'],['notifications','user_id'],['refresh_tokens','user_id'],['audit_logs','actor_user_id']]){
   const [rows]=await fixtureConnection.query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IN (${created.users.map(()=>'?').join(',')})`,created.users.map(user=>user.id));
   assert.equal(Number(rows[0].total),0,'Fixture state remained after rollback');
  }
 }finally{fixtureConnection.release();}}
 console.log('Disposable fixtures, sessions and audit events rolled back; existing history preserved.');
}
main().catch(error=>{console.error(`Permission smoke failed: ${error.code||error.name}`);process.exitCode=1;}).finally(async()=>{try{await cleanup();}catch{console.error('Fixture cleanup failed; inspect only this run\'s allocated IDs.');process.exitCode=1;}await pool.end();});
