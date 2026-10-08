const { test }=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
process.env.JWT_ACCESS_SECRET=randomBytes(32).toString('hex');process.env.JWT_ACCESS_EXPIRES_IN='15m';process.env.NODE_ENV='test';
const cloudPath=require.resolve('../src/config/cloudinary');require.cache[cloudPath]={id:cloudPath,filename:cloudPath,loaded:true,exports:{}};
const pool=require('../src/config/database');
const users=require('../src/modules/users/user.repository');
const tickets=require('../src/modules/tickets/ticket.repository');
const comments=require('../src/modules/tickets/ticketComment.repository');
const attachments=require('../src/modules/tickets/ticketAttachment.repository');
const notifications=require('../src/modules/notifications/notification.repository');
const articles=require('../src/modules/knowledgeBase/knowledgeBaseArticle.repository');
const tokens=require('../src/utils/jwt');

test('five actors swap ticket, comment, attachment, notification and KB IDs through real API authorization',async t=>{
  const actors=['EMPLOYEE','EMPLOYEE','TECHNICIAN','TECHNICIAN','ADMIN'].map((role,i)=>({id:i+1,role,is_active:1,must_change_password:0}));
  const rows=[
    {id:10,created_by:1,assigned_to:3,status:'IN_PROGRESS'},
    {id:11,created_by:2,assigned_to:4,status:'IN_PROGRESS'},
    {id:12,created_by:2,assigned_to:null,status:'OPEN'},
  ].map(row=>({...row,title:`private ticket ${row.id}`,description:'private description',ticket_number:`TEST-${row.id}`,category_id:1,priority_id:1}));
  t.mock.method(users,'findById',async id=>actors.find(u=>String(u.id)===String(id))||null);
  t.mock.method(tickets,'findById',async id=>rows.find(row=>String(row.id)===String(id))||null);
  t.mock.method(tickets,'lockById',async id=>rows.find(row=>String(row.id)===String(id))||null);
  const tx={async beginTransaction(){},async rollback(){},release(){},async commit(){throw new Error('Denied mutation committed');}};
  t.mock.method(pool,'getConnection',async()=>tx);
  const sql=t.mock.method(pool,'query',async()=>{throw new Error('Unexpected real database access');});
  const noteRows=[{id:100,ticket_id:10,comment_type:'PUBLIC',content:'public reply'},
    {id:101,ticket_id:11,comment_type:'PUBLIC',content:'other private reply'},
    {id:102,ticket_id:10,comment_type:'INTERNAL',content:'private internal note'}];
  t.mock.method(comments,'findById',async id=>noteRows.find(row=>String(row.id)===String(id))||null);
  t.mock.method(comments,'findByTicketId',async(id,options)=>noteRows.filter(row=>String(row.ticket_id)===String(id)&&(options.includeInternal||row.comment_type==='PUBLIC')));
  const files=[{id:100,ticket_id:10,comment_id:null,uploaded_by:1,original_name:'owned.txt'},
    {id:101,ticket_id:11,comment_id:null,uploaded_by:2,original_name:'other-secret.txt'},
    {id:102,ticket_id:10,comment_id:102,comment_type:'INTERNAL',uploaded_by:3,original_name:'internal-secret.txt'}];
  t.mock.method(attachments,'findById',async id=>files.find(row=>String(row.id)===String(id))||null);
  t.mock.method(attachments,'findByTicketId',async(id,{includeInternal})=>files.filter(row=>String(row.ticket_id)===String(id)&&(includeInternal||row.comment_id===null)));
  const personal=actors.map(u=>({id:100+u.id,user_id:u.id,type:'TICKET_CREATED',title:'personal notification',message:'private notification',is_read:1}));
  t.mock.method(notifications,'findByIdAndUserId',async(id,userId)=>personal.find(row=>String(row.id)===String(id)&&String(row.user_id)===String(userId))||null);
  t.mock.method(articles,'findById',async id=>({id,category_id:1,category_is_active:1,status:'DRAFT',title:'private draft',content:'private draft content'}));
  const writes=[];
  function forbid(object,method){writes.push(t.mock.method(object,method,async()=>{throw new Error(`Denied request reached ${method}`);}));}
  for(const method of ['updateEmployeeDetails','updateWorkingStatus','updatePriority','resolveTicket','closeTicket','reopenTicket','assignTechnician','updateAssignment','unassignTicket'])forbid(tickets,method);
  forbid(comments,'createComment');forbid(attachments,'createAttachment');forbid(attachments,'deleteById');forbid(notifications,'markAsRead');
  const cloud=require('../src/services/cloudinaryUpload.service');forbid(cloud,'uploadAttachmentBuffer');forbid(cloud,'deleteCloudinaryAsset');
  // Install before loading the controller, which destructures this helper.
  const transfer=t.mock.method(require('../src/services/attachmentDownload.service'),'fetchAttachment',async()=>{throw new Error('Denied request reached file delivery');});
  forbid(require('../src/modules/ticketFeedback/ticketFeedback.repository'),'create');
  forbid(require('../src/modules/knowledgeBase/articleFeedback.repository'),'create');
  const app=require('../src/app');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.closeAllConnections();server.close();});const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  const bearer=actors.map(u=>tokens.generateAccessToken(u));let checked=0;
  async function request(actor,method,path,body){const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${bearer[actor-1]}`,...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {response,text:await response.text()};}
  async function deny(actor,method,path,body,status=404){const{response,text}=await request(actor,method,path,body);assert.equal(response.status,status,`${actor} ${method} ${path}: ${text}`);assert.doesNotMatch(text,/private ticket|private description|secret\.txt|private internal|private draft|personal notification|res\.cloudinary/);assert.equal(response.headers.get('location'),null);checked++;}
  // Neighboring-ID reads, with allowed controls, exercise both Employee and Technician scope.
  for(const actor of [1,2,3,4,5])for(const row of rows){const allowed=actor===5||row.created_by===actor&&actor<3||actor>=3&&actor<=4&&(row.assigned_to===null||row.assigned_to===actor);
    for(const suffix of ['', '/comments','/attachments']){
      const{response}=await request(actor,'GET',`/tickets/${row.id}${suffix}`);assert.equal(response.status,allowed?200:404);
    }
  }
  // Full Employee horizontal mutation/read surface, plus history.
  for(const [method,suffix,body] of [
    ['PATCH','',{title:'Changed valid title'}],['POST','/comments',{content:'Harmless reply'}],
    ['POST','/attachments',undefined],['POST','/comments/101/attachments',undefined],
    ['PATCH','/close',{}],['PATCH','/reopen',{}],['PUT','/feedback',{rating:5}],
    ['GET','/status-history'],['GET','/assignment-history'],['GET','/attachments/101/download'],['DELETE','/attachments/101'],
  ])await deny(1,method,`/tickets/11${suffix}`,body);
  for(const [method,suffix,body] of [
    ['PATCH','/status',{status:'WAITING_FOR_USER'}],['PATCH','/priority',{priorityId:1}],
    ['PATCH','/resolve',{resolutionSummary:'Resolved with a harmless fixture'}],['POST','/comments',{content:'Harmless reply'}],
    ['POST','/internal-notes',{content:'Harmless note'}],['POST','/attachments'],
    ['GET','/status-history'],['GET','/assignment-history'],['GET','/attachments/101/download'],['DELETE','/attachments/101'],
  ])await deny(3,method,`/tickets/11${suffix}`,body);
  await deny(1,'POST','/tickets/10/internal-notes',{content:'Harmless note'},403);
  for(const actor of [1,3,5]){
    await deny(actor,'POST','/tickets/10/comments/101/attachments');
    await deny(actor,'GET','/tickets/10/attachments/101/download');
    await deny(actor,'DELETE','/tickets/10/attachments/101');
  }
  await deny(1,'GET','/tickets/10/attachments/102/download');
  await deny(1,'POST','/tickets/10/comments/102/attachments');
  await deny(1,'DELETE','/tickets/10/attachments/102');
  const ownComments=JSON.parse((await request(1,'GET','/tickets/10/comments')).text);
  assert.doesNotMatch(JSON.stringify(ownComments),/INTERNAL|private internal/);
  for(const actor of [1,2,3,4,5])for(const notification of personal){const{response}=await request(actor,'PATCH',`/notifications/${notification.id}/read`);assert.equal(response.status,actor===notification.user_id?200:404);}
  for(const actor of [1,2,3,4]){
    await deny(actor,'GET','/knowledge-base/articles/100');
    await deny(actor,'GET','/knowledge-base/articles/100/feedback');
    await deny(actor,'PUT','/knowledge-base/articles/100/feedback',{isHelpful:true});
  }
  assert.equal((await request(5,'GET','/knowledge-base/articles/100')).response.status,200);
  await deny(5,'PUT','/knowledge-base/articles/100/feedback',{isHelpful:true},403);
  for(const [actor,method,path,body] of [
    [1,'PATCH','/tickets/10',{requesterId:2,role:'ADMIN'}],
    [3,'POST','/tickets/12/self-assign',{technicianId:4}],
    [1,'PATCH','/auth/change-password',{userId:2,currentPassword:'Valid123!',newPassword:'Valid456!',confirmPassword:'Valid456!'}],
    [1,'GET','/tickets/my?userId=2'],[3,'GET','/tickets/assigned-to-me?technicianId=4'],
    [1,'GET','/notifications?userId=2'],[3,'GET','/dashboard/status-distribution?technicianId=4'],
  ])await deny(actor,method,path,body,422);
  for(const write of writes)assert.equal(write.mock.callCount(),0);
  assert.equal(transfer.mock.callCount(),0);assert.equal(sql.mock.callCount(),0);
  t.diagnostic(`${checked} denied object/field swaps plus 45 ticket reads and 25 notification ownership combinations; no writes or file delivery`);
});
