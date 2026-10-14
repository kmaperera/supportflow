// Actual Admin App/UI + native HTTP + local MySQL; reuse the 19.4 bootstrap.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const fixture=await require('../../server/tests/helpers/adminWorkflowFixture')()
const [employee,otherEmployee,technician,admin,otherTechnician]=fixture.users
const api=fixture.request,port=process.env.KEYBOARD_CDP_PORT||'9226'
let ws,target,createdResponseId,stage='setup',checkpoints=0
const faults=[]
try {
  employee.token=(await api(null,'POST','/auth/login',{email:employee.email,password:fixture.password})).data.accessToken
  const title='Admin workflow '+fixture.run
  const ticketBody={title,description:'Harmless Admin ticket description & <quoted> content. '.repeat(14),categoryId:fixture.categoryId,priorityId:String(fixture.priority.id)}
  const tickets=[]
  for(let index=0;index<12;index++)tickets.push((await api(employee,'POST','/tickets',{...ticketBody,title:title+' '+index+(index===0?' Long quoted & <title>. '.repeat(5):'')},201)).data.ticket)
  const ticket=tickets[0],id=String(ticket.id)
  await api(admin,'PATCH',`/tickets/${tickets[1].id}/assign`,{technicianId:otherTechnician.id})
  await api(admin,'PATCH',`/tickets/${tickets[2].id}/assign`,{technicianId:technician.id})
  await api(technician,'PATCH',`/tickets/${tickets[2].id}/status`,{status:'IN_PROGRESS'})
  await api(technician,'PATCH',`/tickets/${tickets[2].id}/resolve`,{resolutionSummary:'Harmless Admin fixture preparation resolved.'})
  const auditCount=async(action,entityId)=>{
    const [rows]=await fixture.connection.execute('SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id=? AND action=? AND entity_id=?',[admin.id,action,String(entityId)])
    return Number(rows[0].total)
  }
  target=await(await fetch(`http://localhost:${port}/json/new?about:blank`,{method:'PUT'})).json()
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
  let sequence=0;const pending=new Map()
  ws.onmessage=event=>{
    const message=JSON.parse(event.data)
    if(message.method==='Network.responseReceived'&&message.params.response.status===201&&new URL(message.params.response.url).pathname==='/api/v1/users')createdResponseId=message.params.requestId
    if(message.method==='Runtime.exceptionThrown')faults.push('Uncaught browser exception')
    if(message.method==='Runtime.consoleAPICalled'&&['warning','error'].includes(message.params.type))faults.push('Browser console warning/error')
    if(message.method==='Network.loadingFailed'&&message.params.corsErrorStatus)faults.push('CORS failure')
    if(!message.id)return
    const call=pending.get(message.id);pending.delete(message.id);if(!call)return;clearTimeout(call.timer)
    if(message.error)call.reject(Object.assign(Error('CDP command failed'),{code:message.error.code}));else call.resolve(message.result)
  }
  const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++sequence;const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('CDP command timed out'))},10000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({id:requestId,method,params}))})
  async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('Browser evaluation failed');return result.result.value}
  async function until(expression){for(let i=0;i<400;i++){try{if(await evaluate(expression))return}catch(error){if(error.code!==-32000)throw error}await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Expected Admin UI state not reached')}
  const text=value=>until(`document.body.textContent.includes(${JSON.stringify(value)})`)
  const navigate=route=>evaluate(`location.hash=${JSON.stringify('#'+route)}`)
  const reload=async()=>{const previous=await evaluate('window.employeeFixture.realm');await send('Page.reload',{ignoreCache:true});await until(`window.employeeFixture?.realm&&window.employeeFixture.realm!==${JSON.stringify(previous)}`)}
  const fill=async(selector,value)=>{await until(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);await send('Input.insertText',{text:value})}
  const click=async(label,scope='document')=>{const candidate=`[...${scope}?.querySelectorAll('button')||[]].find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.textContent.trim().startsWith(${JSON.stringify(label+' ')} )||(${JSON.stringify(label)}==='View Ticket'&&b.textContent.trim().startsWith('View Ticket:')))&&!b.disabled)`;await until(`Boolean(${candidate})`);return evaluate(`${candidate}.click()`)}
  const link=label=>evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.trim()===${JSON.stringify(label)}).click()`)
  const choose=async(selector,value)=>{await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);return evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(String(value))};element.dispatchEvent(new Event('change',{bubbles:true}));})()`)}
  const selectAt=(index,value)=>evaluate(`(()=>{const element=document.querySelectorAll('main select')[${index}];element.value=${JSON.stringify(String(value))};element.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  const submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('form').requestSubmit()`)
  const key=async(value,shift=false)=>{const codes={Enter:13,' ':32,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38};const params={key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:codes[value],modifiers:shift?8:0};await send('Input.dispatchKeyEvent',{type:'keyDown',...params,...([' ','Enter'].includes(value)?{text:value==='Enter'?'\r':' '}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',...params})}
  const checkpoint=name=>{stage=name;checkpoints++;console.log('Checking: '+name)}
  const userRow=email=>`[...document.querySelectorAll('main li')].find(e=>[...e.querySelectorAll('dd')].some(d=>d.textContent===${JSON.stringify(email)}))`
  const categoryRow=name=>`[...document.querySelectorAll('main li')].find(e=>e.querySelector('h2')?.textContent===${JSON.stringify(name)})`
  const articleRow=name=>`[...document.querySelectorAll('main article')].find(e=>e.querySelector('h3')?.textContent===${JSON.stringify(name)})`
  const dialog='document.querySelector("dialog[open]")'
  const confirm=async label=>{await until('Boolean(document.querySelector("dialog[open]"))');await click(label,dialog)}
  const search=async value=>{await fill('main input[type=search]',value);await new Promise(resolve=>setTimeout(resolve,400))}
  await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Page.bringToFront')
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false})
  await send('Network.clearBrowserCookies');await send('Page.navigate',{url:'http://localhost:5173/tests/adminWorkflow.browser.html#/login'})
  checkpoint('login/layout/dashboard')
  await fill('#login-email',admin.email);await fill('#login-password',fixture.password);await submit('#login-email');await until('location.hash==="#/admin"');await text('Recent tickets');await until('!document.body.textContent.includes("Loading dashboard")')
  const nav=['Dashboard','Users','Technicians','Categories','Tickets','SLA Settings','Knowledge Base','Notifications','Analytics','Reports','Audit Logs','Profile']
  assert.deepEqual(await evaluate(`[...document.querySelector('nav[aria-label="Admin navigation"]').querySelectorAll('a')].map(a=>a.textContent.trim())`),nav)
  assert.equal(await evaluate(`document.querySelector('nav[aria-label="Admin navigation"] a[aria-current="page"]').getAttribute('href')`),'#/admin')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('nav[aria-label="Admin navigation"] a')).textDecorationLine`),'none')
  const summary=(await api(admin,'GET','/dashboard/admin/summary')).data.summary
  const [counts]=await fixture.connection.query('SELECT COUNT(*) AS total,SUM(assigned_to IS NULL) AS unassigned FROM tickets')
  assert.equal(summary.totalTickets,Number(counts[0].total));assert.equal(summary.unassignedTickets,Number(counts[0].unassigned))
  await link('Manage Users');await text('User Management')

  checkpoint('users search/filters/pagination/create/duplicate')
  await search(fixture.run);await text('of 21 users');await click('Next');await until(`Boolean(document.querySelector('button[aria-label="Go to page 2"][aria-current="page"]'))`);await click('Previous');await until(`Boolean(document.querySelector('button[aria-label="Go to page 1"][aria-current="page"]'))`)
  await selectAt(0,'TECHNICIAN');await text('of 2 users');await selectAt(1,'true');await text('of 2 users')
  await search('No matching users & <fixture>');await text('No users match');await click('Clear filters');await search(fixture.run);await text('of 21 users')
  await link('Create User');await text('New accounts are active');assert.equal(await evaluate(`document.querySelector('nav[aria-label="Admin navigation"] a[aria-current="page"]').getAttribute('href')`),'#/admin/users')
  await submit('#create-user-firstName');await until('document.querySelector("#create-user-firstName").getAttribute("aria-invalid")==="true"')
  const createdEmail=`created-admin-${fixture.run}@example.test`,createdName='Admin & <long> '+('Workflow '.repeat(5)).trim()
  const populate=async(email)=>{for(const [field,value] of Object.entries({firstName:createdName,lastName:'Fixture',email,password:fixture.password,confirmPassword:fixture.password,department:'Harmless & quoted department'}))await fill('#create-user-'+field,value)}
  await populate(createdEmail);await evaluate('window.employeeFixture.delay=200;{const form=document.querySelector("#create-user-firstName").closest("form");form.requestSubmit();form.requestSubmit()}');await until('document.querySelector("#create-user-password")?.disabled');await text('User created successfully.');await evaluate('window.employeeFixture.delay=0')
  const created=(await api(admin,'GET','/users?search='+encodeURIComponent(createdEmail))).data.users[0];assert.equal(created.role,'EMPLOYEE');assert.equal(created.isActive,true);assert.equal(created.mustChangePassword,true)
  fixture.users.push({id:String(created.id),email:createdEmail,role:'EMPLOYEE'})
  assert.equal(await auditCount('USER_CREATED',created.id),1)
  assert.equal(await evaluate(`window.employeeFixture.requests.filter(r=>r.method==='post'&&r.url==='/users').length`),1)
  const createResponse=await send('Network.getResponseBody',{requestId:createdResponseId});assert.ok(!createResponse.body.includes(fixture.password));assert.ok(!Object.keys(JSON.parse(createResponse.body).data.user).some(key=>/password|token|cookie/i.test(key)&&key!=='mustChangePassword'))
  assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(fixture.password)})||JSON.stringify({...localStorage,...sessionStorage}).includes(${JSON.stringify(fixture.password)})`),false)
  assert.ok(!Object.keys(created).some(key=>/password|token|cookie/i.test(key)&&key!=='mustChangePassword'))
  await link('Create User');await populate(createdEmail);await submit('#create-user-email');await text('A user with this email already exists.')
  const [duplicates]=await fixture.connection.execute('SELECT COUNT(*) AS total FROM users WHERE email=?',[createdEmail]);assert.equal(Number(duplicates[0].total),1);assert.equal(await auditCount('USER_CREATED',created.id),1)
  await navigate('/admin/users');await text('User Management');await search(createdEmail);await text(createdName)

  checkpoint('user status/role/self safeguards/dialogs')
  const row=userRow(createdEmail)
  stage='role editor open';await click('Change Role',row);await choose('main li select','TECHNICIAN')
  stage='role dialog trigger';await evaluate(`[...${row}.querySelectorAll('button')].find(b=>b.textContent==='Update Role').focus()`);await key('Enter');await until('Boolean(document.querySelector("dialog[open]"))')
  stage='role dialog tab trap';await key('Tab');await key('Tab',true);assert.equal(await evaluate('document.querySelector("dialog[open]").contains(document.activeElement)'),true)
  stage='role dialog escape';await key('Escape');await until('!document.querySelector("dialog[open]")');assert.equal(await evaluate('document.activeElement.textContent'), 'Update Role')
  // Change Role editor first, then its confirmation; escape preserved the editor.
  await click('Cancel',row);await evaluate(`[...${row}.querySelectorAll('button')].find(b=>b.textContent.startsWith('Deactivate')).focus()`);await key('Enter');await until('Boolean(document.querySelector("dialog[open]"))');await click('Cancel',dialog);await until('!document.querySelector("dialog[open]")');assert.equal(await evaluate('document.activeElement.textContent.startsWith("Deactivate")'),true);assert.equal(await auditCount('USER_DEACTIVATED',created.id),0);await click('Deactivate',row);await confirm('Deactivate User');await text('User deactivated successfully.')
  assert.equal(await auditCount('USER_DEACTIVATED',created.id),1);await api(admin,'PATCH',`/users/${created.id}/status`,{isActive:false});assert.equal(await auditCount('USER_DEACTIVATED',created.id),1)
  await selectAt(1,'false');await text('of 1 users');await selectAt(1,'');await text('of 1 users')
  await click('Activate',row);await text('User activated successfully.');assert.equal(await auditCount('USER_ACTIVATED',created.id),1)
  await click('Change Role',row);await choose('main li select','TECHNICIAN');await click('Update Role',row);await confirm('Change Role');await text('User role updated successfully.');assert.equal((await api(admin,'GET',`/users/${created.id}`)).data.user.role,'TECHNICIAN');assert.equal(await auditCount('USER_ROLE_CHANGED',created.id),1)
  await click('Change Role',row);await choose('main li select','EMPLOYEE');await click('Update Role',row);await confirm('Change Role');await until(`!document.querySelector('dialog[open]')&&${row}&&!${row}.querySelector('select')&&[...${row}.querySelectorAll('dd')].some(d=>d.textContent==='Employee')`);assert.equal(await auditCount('USER_ROLE_CHANGED',created.id),2)
  await search(admin.email);await text('You cannot change your own role.');await text('You cannot deactivate your own account.')
  await api(admin,'PATCH',`/users/${admin.id}/role`,{role:'EMPLOYEE'},400);await api(admin,'PATCH',`/users/${admin.id}/status`,{isActive:false},400)
  await api(admin,'PATCH',`/users/${otherEmployee.id}/role`,{role:'TECHNICIAN'});assert.equal((await api(otherEmployee,'GET','/auth/me')).data.user.role,'TECHNICIAN');await api(admin,'PATCH',`/users/${otherEmployee.id}/role`,{role:'EMPLOYEE'})

  checkpoint('technicians/category management')
  await navigate('/admin/technicians');await text('Technician Management');const clearControl=`[...document.querySelectorAll('main button')].find(b=>b.textContent==='Clear filters')`;assert.equal(await evaluate(`${clearControl}.disabled&&getComputedStyle(${clearControl}).cursor==='not-allowed'`),true);await search(technician.email);await text('of 1 technicians');assert.equal(await evaluate(`!${clearControl}.disabled&&getComputedStyle(${clearControl}).cursor==='pointer'&&${clearControl}.getBoundingClientRect().width<180`),true);await text('Active tickets');await selectAt(0,'true');await text('of 1 technicians');await search('No matching technician & fixture');await text('No technicians match');await click('Clear filters')
  await navigate('/admin/categories');await text('Category Management');await search('Hidden employee fixture '+fixture.run);await until(`Boolean(${categoryRow('Hidden employee fixture '+fixture.run)})`);assert.equal(await evaluate(`${categoryRow('Hidden employee fixture '+fixture.run)}.textContent.includes('Inactive')`),true);assert.equal(await evaluate('[...document.querySelectorAll("main button")].some(b=>b.textContent.includes("Delete"))'),false)
  await link('Add Category');await fill('#category-name','Admin category '+fixture.run);await fill('#category-description','Long harmless description & <text>. '.repeat(8));await submit('#category-name');await text('Description must be at most 255 characters.');await fill('#category-description','Long harmless description & <text>. '.repeat(6));await submit('#category-name');await text('Category created successfully.')
  let category=(await api(admin,'GET','/tickets/admin/categories')).data.categories.find(c=>c.name==='Admin category '+fixture.run);assert.ok(category);assert.equal(await auditCount('CATEGORY_CREATED',category.id),1)
  const renamed='Admin renamed & '+fixture.run
  await navigate('/admin/categories/'+category.id+'/edit');await fill('#category-name',renamed);await submit('#category-name');await text('Category updated successfully.');await search(renamed)
  await click('Deactivate',categoryRow(renamed));await confirm('Deactivate Category');await text('Category deactivated successfully.');await text(renamed)
  assert.ok(!(await api(employee,'GET','/tickets/categories')).data.categories.some(c=>String(c.id)===String(category.id)))
  await click('Activate',categoryRow(renamed));await text('Category activated successfully.');assert.ok((await api(employee,'GET','/tickets/categories')).data.categories.some(c=>String(c.id)===String(category.id)))
  for(const action of ['CATEGORY_UPDATED','CATEGORY_DEACTIVATED','CATEGORY_ACTIVATED'])assert.equal(await auditCount(action,category.id),1)

  checkpoint('all tickets/search/filter/sort/pagination')
  await navigate('/admin/tickets');await text('Ticket Management');await search(title);await text('of 12 tickets');await click('Next');await until(`Boolean(document.querySelector('button[aria-label="Go to page 2"][aria-current="page"]'))`);await click('Previous');await until(`Boolean(document.querySelector('button[aria-label="Go to page 1"][aria-current="page"]'))`)
  await until('document.querySelectorAll("main select").length===6&&![...document.querySelectorAll("main select")].some(s=>s.disabled)')
  for(const [index,value] of [[0,'OPEN'],[1,fixture.priority.id],[2,fixture.categoryId],[3,'unassigned'],[5,'oldest'],[5,'newest']]){await selectAt(index,value);await text('of 10 tickets')}
  await search('No tickets & <fixture>');await text('No tickets match');await click('Clear filters');await search(ticket.ticketNumber);await until(`Boolean(document.getElementById('admin-ticket-number-${id}'))`)
  await evaluate(`document.querySelector('a[aria-labelledby^="admin-ticket-number-${id}"]').focus()`);await key('Enter');await text('Assignment');await text('Unassigned')

  checkpoint('combobox assign/reassign/unassign/stale ID')
  async function selectTechnician(person){await until('Boolean(document.querySelector("input[role=combobox]"))');await fill('input[role=combobox]',person.email);await until('document.querySelectorAll("[role=option]").length===1');assert.equal(await evaluate(`(()=>{const input=document.querySelector('input[role=combobox]').getBoundingClientRect(),list=document.querySelector('[role=listbox]').getBoundingClientRect();return Math.abs(input.left-list.left)<3&&Math.abs(input.width-list.width)<3&&input.width<=512})()`),true);await key('ArrowDown');await key('Enter');await click('Continue');await until('Boolean(document.querySelector("dialog[open]"))')}
  await click('Assign technician');await selectTechnician(technician);await key('Escape');await until('!document.querySelector("dialog[open]")');await click('Continue');await confirm('Assign Technician');await text('Ticket assigned successfully.')
  let assigned=(await api(admin,'GET',`/tickets/${id}`)).data.ticket;const firstAssignment=String(assigned.assignment.id);assert.equal(String(assigned.assignedTo),technician.id);assert.equal(await auditCount('TICKET_ASSIGNED',id),1)
  await click('Reassign');await selectTechnician(otherTechnician);await evaluate('window.employeeFixture.delay=200;{const button=[...document.querySelector("dialog[open]").querySelectorAll("button")].find(b=>b.textContent==="Reassign Ticket");button.click();button.click()}');await until('document.querySelector("dialog[open]")?.textContent.includes("Reassigning")');await text('Ticket reassigned successfully.');await evaluate('window.employeeFixture.delay=0')
  assigned=(await api(admin,'GET',`/tickets/${id}`)).data.ticket;assert.equal(String(assigned.assignedTo),otherTechnician.id);assert.equal(await auditCount('TICKET_REASSIGNED',id),1)
  const beforeUnassign=await auditCount('TICKET_UNASSIGNED',id);await api(admin,'PATCH',`/tickets/${id}/unassign`,{expectedAssignmentId:firstAssignment},409);assert.equal(await auditCount('TICKET_UNASSIGNED',id),beforeUnassign)
  await click('Unassign');await until('Boolean(document.querySelector("dialog[open]"))');await api(admin,'PATCH',`/tickets/${id}/assign`,{technicianId:technician.id,expectedAssignmentId:assigned.assignment.id});await confirm('Unassign Ticket');await text('Ticket assignment has changed. Refresh and try again.');assert.equal(await auditCount('TICKET_UNASSIGNED',id),beforeUnassign)
  await click('Unassign');await confirm('Unassign Ticket');await text('Ticket unassigned successfully.');assigned=(await api(admin,'GET',`/tickets/${id}`)).data.ticket;assert.equal(assigned.assignedTo,null);assert.equal(assigned.status,'OPEN');assert.equal(await auditCount('TICKET_UNASSIGNED',id),1)
  const [history]=await fixture.connection.execute('SELECT COUNT(*) AS total FROM ticket_assignments WHERE ticket_id=?',[id]);assert.equal(Number(history[0].total),3)
  await navigate('/admin/tickets/'+tickets[2].id);await text('Assignment cannot be changed on resolved or closed tickets.')
  await navigate('/admin/technicians/workload');await text('Technician Workload');await text(technician.email)
  const workload=(await api(admin,'GET','/users/technician-workload')).data.technicians;assert.equal(workload.find(p=>String(p.id)===otherTechnician.id).workload.totalActive,1)

  checkpoint('SLA update/validation/restore')
  const policies=(await api(admin,'GET','/sla/policies')).data.policies,policy=policies.find(p=>String(p.priorityId)===String(fixture.priority.id))||policies[0]
  await navigate('/admin/sla');await text('Changes apply to new tickets');await until('!document.body.textContent.includes("Loading SLA settings")')
  for(const p of policies)await text(p.priorityName[0]+p.priorityName.slice(1).toLowerCase())
  const policyCard=`[...document.querySelectorAll('main section')].find(s=>s.querySelector('h2')?.textContent.toLowerCase()===${JSON.stringify(policy.priorityName.toLowerCase())})`
  await click('Edit',policyCard);await fill(`[id="${policy.id}-responseTimeMinutes"]`,'0');await submit(`[id="${policy.id}-responseTimeMinutes"]`);await until(`document.getElementById('${policy.id}-responseTimeMinutes').getAttribute('aria-invalid')==='true'`)
  await api(admin,'PATCH','/sla/policies/'+policy.id,{responseTimeMinutes:-1,resolutionTimeMinutes:'invalid'},422)
  await fill(`[id="${policy.id}-responseTimeMinutes"]`,String(policy.responseTimeMinutes+1));await fill(`[id="${policy.id}-resolutionTimeMinutes"]`,String(policy.resolutionTimeMinutes+1));await submit(`[id="${policy.id}-responseTimeMinutes"]`);await text('SLA policy updated successfully.')
  assert.equal((await api(admin,'GET','/sla/policies')).data.policies.find(p=>p.id===policy.id).responseTimeMinutes,policy.responseTimeMinutes+1)
  assert.equal(await auditCount('SLA_POLICY_UPDATED',policy.id),1)
  const restoredPolicy=(await api(admin,'PATCH','/sla/policies/'+policy.id,{responseTimeMinutes:policy.responseTimeMinutes,resolutionTimeMinutes:policy.resolutionTimeMinutes})).data.policy;assert.equal(restoredPolicy.responseTimeMinutes,policy.responseTimeMinutes);assert.equal(restoredPolicy.resolutionTimeMinutes,policy.resolutionTimeMinutes);assert.equal(await auditCount('SLA_POLICY_UPDATED',policy.id),2)

  checkpoint('KB category/article create/edit/publication')
  await navigate('/admin/knowledge-base');await text('Knowledge Base Management');await click('KB Categories');await click('Add KB Category');const kbName='Admin KB '+fixture.run
  await fill('#kb-category-name',kbName);await fill('#kb-category-description','Harmless empty category & <description>');await submit('#kb-category-name');await text('KB category created successfully.')
  let kbCategory=(await api(admin,'GET','/knowledge-base/categories')).data.categories.find(c=>c.name===kbName);assert.ok(kbCategory);assert.equal(await auditCount('KB_CATEGORY_CREATED',kbCategory.id),1)
  const kbRow=articleRow(kbName);await click('Edit',kbRow);await fill('#kb-category-description','Updated harmless KB category');await submit('#kb-category-name');await text('KB category updated successfully.')
  await click('Deactivate',kbRow);await confirm('Deactivate Category');await text('KB category deactivated successfully.');assert.ok((await api(admin,'GET','/knowledge-base/categories')).data.categories.some(c=>c.id===kbCategory.id&&!c.isActive));await click('Activate',kbRow);await text('KB category activated successfully.')
  await click('KB Articles');await link('Add Article');const kbTitle='Admin article & <quoted> '+fixture.run
  await fill('#kb-title',kbTitle);await choose('#kb-categoryId',kbCategory.id);await fill('#kb-content','Long harmless "quoted" article & <text>. '.repeat(40));await submit('#kb-title');await text('Article created successfully.')
  await search(kbTitle);await text(kbTitle)
  let article=(await api(admin,'GET','/knowledge-base/articles?search='+encodeURIComponent(kbTitle))).data.articles[0];assert.equal(article.status,'DRAFT');assert.equal(await auditCount('KB_ARTICLE_CREATED',article.id),1)
  await navigate('/admin/knowledge-base/articles/'+article.id+'/edit');await fill('#kb-content','Updated longer harmless content & <text>. '.repeat(40));await submit('#kb-title');await text('Article updated successfully.');await search(kbTitle)
  await click('Publish',articleRow(kbTitle));await text('Article published successfully.');assert.equal((await api(employee,'GET','/knowledge-base/articles/'+article.id)).data.article.status,'PUBLISHED');assert.equal((await api(technician,'GET','/knowledge-base/articles/'+article.id)).data.article.status,'PUBLISHED')
  await click('Unpublish',articleRow(kbTitle));await text('Article unpublished successfully.');await api(employee,'GET','/knowledge-base/articles/'+article.id,undefined,404)
  await click('Archive',articleRow(kbTitle));await confirm('Archive Article');await text('Article archived successfully.')
  for(const action of ['KB_ARTICLE_UPDATED','KB_ARTICLE_PUBLISHED','KB_ARTICLE_UNPUBLISHED','KB_ARTICLE_ARCHIVED'])assert.equal(await auditCount(action,article.id),1)

  checkpoint('personal Admin notifications')
  await navigate('/admin/notifications');await text('No notifications yet');const notificationService=require('../../server/src/modules/notifications/notification.service')
  const notice=await notificationService.createNotification({userId:admin.id,ticketId:Number(id),type:'TICKET_ASSIGNED',title:'Admin personal fixture notice',message:'Harmless personal notice'})
  for(let attempt=0;attempt<80&&!fixture.io.sockets.adapter.rooms.get('user:'+admin.id)?.size;attempt++)await new Promise(resolve=>setTimeout(resolve,50))
  assert.ok(fixture.io.sockets.adapter.rooms.get('user:'+admin.id)?.size)
  require('../../server/src/modules/notifications/notificationRealtime.service').emitNotification(notice)
  stage='Admin notification arrival';await text('Admin personal fixture notice');stage='Admin notification navigation';await click('View Ticket');await until(`location.hash==='#/admin/tickets/${id}'`)
  const [read]=await fixture.connection.execute('SELECT is_read FROM notifications WHERE id=?',[notice.id]);assert.equal(read[0].is_read,1)
  await navigate('/admin/notifications');await text('Admin personal fixture notice');const requestCount=await evaluate('window.employeeFixture.requests.length');await click('View Ticket');await until(`location.hash==='#/admin/tickets/${id}'`);assert.equal(await evaluate(`window.employeeFixture.requests.slice(${requestCount}).some(r=>r.method==='patch'&&r.url.endsWith('/read'))`),false)
  const second=await notificationService.createNotification({userId:admin.id,ticketId:Number(id),type:'TICKET_ASSIGNED',title:'Second Admin personal fixture notice',message:'Harmless second notice'});await navigate('/admin/notifications');await text('Second Admin personal fixture notice');await click('Mark all as read');await until('!document.body.textContent.includes("Unread")')
  const [readAll]=await fixture.connection.execute('SELECT is_read FROM notifications WHERE id=?',[second.id]);assert.equal(readAll[0].is_read,1);assert.ok((await api(admin,'GET','/notifications')).data.notifications.every(n=>String(n.userId)===admin.id))

  checkpoint('analytics/light-dark/charts')
  await navigate('/admin/analytics');await text('Analytics Dashboard');await until('!document.body.textContent.includes("Loading analytics")');await until('document.querySelectorAll("svg.recharts-surface").length>=2')
  assert.equal(await evaluate('/NaN|undefined/.test(document.querySelector("main").textContent)'),false)
  const chartColor=()=>evaluate('getComputedStyle(document.documentElement).getPropertyValue("--chart-text").trim()')
  if(await evaluate('document.documentElement.classList.contains("dark")')){await evaluate(`document.querySelector('button[aria-label="Switch to light mode"]').click()`);await until('!document.documentElement.classList.contains("dark")')}
  const lightChart=await chartColor();await evaluate(`document.querySelector('button[aria-label="Switch to dark mode"]').focus()`);await key(' ');await until('document.documentElement.classList.contains("dark")');assert.notEqual(await chartColor(),lightChart)
  await choose('#analytics-period','daily');await until('!document.body.textContent.includes("Loading analytics")')
  const idleRequests=await evaluate('window.employeeFixture.requests.length');await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(await evaluate('window.employeeFixture.requests.length'),idleRequests)

  checkpoint('reports/date validation/CSV/PDF in-memory downloads')
  await navigate('/admin/reports');await text('Generate a report');await until('Boolean(document.querySelector("#report-search"))');await fill('#report-search',title)
  const setDate=(selector,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  const today=new Date().toISOString().slice(0,10)
  await setDate('#report-startDate','2026-10-15');await setDate('#report-endDate','2026-10-14');await submit('#report-search');await until('document.getElementById("report-endDate").getAttribute("aria-invalid")==="true"')
  await setDate('#report-startDate',today);await setDate('#report-endDate',today);await submit('#report-search');await text('Ticket Report results');await text(ticket.ticketNumber)
  await evaluate(`(()=>{let blob;const original=URL.createObjectURL;URL.createObjectURL=value=>{blob=value;return original(value)};const originalClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){const name=this.download;window.employeeFixture.download=Promise.all([blob.slice(0,8).text(),blob.slice(-16).text(),blob.text()]).then(([header,tail,content])=>({name,size:blob.size,type:blob.type,header,tail,content:name.endsWith('.csv')?content:null}));return}return originalClick.call(this)};})()`)
  await click('Export CSV');await until('Boolean(window.employeeFixture.download)');const csv=await evaluate('window.employeeFixture.download');assert.ok(csv.name.endsWith('.csv')&&csv.size>0&&csv.type.startsWith('text/csv'));assert.ok(csv.content.includes(ticket.ticketNumber));assert.ok(csv.content.split('\n').length>=13)
  await text('CSV download started.');await evaluate('window.employeeFixture.download=null');await click('Export PDF');await until('Boolean(window.employeeFixture.download)');const pdf=await evaluate('window.employeeFixture.download');assert.ok(pdf.name.endsWith('.pdf')&&pdf.size>100&&pdf.header.startsWith('%PDF-')&&pdf.tail.includes('%%EOF'));await text('PDF download started.')
  const exportResponse=await fetch('http://localhost:5099/api/v1/reports/tickets/export/csv?search='+encodeURIComponent(title),{headers:{Authorization:'Bearer '+admin.token,Origin:'http://localhost:5173'}});assert.equal(exportResponse.status,200);assert.ok(exportResponse.headers.get('access-control-expose-headers').toLowerCase().includes('content-disposition'));assert.ok(exportResponse.headers.get('content-disposition').includes(csv.name));await exportResponse.arrayBuffer()
  await fill('#report-search','No matching report & fixture');await submit('#report-search');await text('No report data found')

  checkpoint('audit viewer/real events/filter/no duplicate metadata')
  const logs=(await api(admin,'GET','/audit-logs?actorUserId='+admin.id+'&limit=100')).data.logs
  for(const action of ['USER_CREATED','USER_ROLE_CHANGED','USER_ACTIVATED','USER_DEACTIVATED','CATEGORY_CREATED','CATEGORY_UPDATED','TICKET_ASSIGNED','TICKET_REASSIGNED','TICKET_UNASSIGNED','SLA_POLICY_UPDATED','KB_CATEGORY_CREATED','KB_ARTICLE_CREATED','KB_ARTICLE_PUBLISHED'])assert.ok(logs.some(row=>row.action===action))
  for(const log of logs){assert.ok(Number.isFinite(Date.parse(log.createdAt)));const raw=JSON.stringify(log.metadata);assert.ok(!/password|token|cookie|authorization|requestBody/i.test(raw));assert.ok(!JSON.stringify(log).includes(fixture.password))}
  await navigate('/admin/audit-logs');await text('Audit Logs');await until('Boolean(document.querySelector("table tbody tr"))');await fill('#audit-actorUserId',admin.id);await click('Apply filters');await until('Boolean(document.querySelector("table tbody tr"))');await click('Next');await until(`Boolean(document.querySelector('button[aria-label="Go to page 2"][aria-current="page"]'))`)
  await fill('#audit-action','TICKET_REASSIGNED');await fill('#audit-entityType','TICKET');await fill('#audit-entityId',id);await setDate('#audit-startDate',today);await setDate('#audit-endDate',today);await fill('#audit-search','TICKET_REASSIGNED');await click('Apply filters');await text('TICKET_REASSIGNED');await until('document.querySelectorAll("table tbody tr").length===2');await evaluate('document.querySelector("main details summary").click()');await text('newAssignmentId')
  await fill('#audit-search','No matching audit & fixture');await click('Apply filters');await text('No audit logs match');await click('Clear filters')
  await api(admin,'GET','/audit-logs?outcome=SUCCESS',undefined,400)

  checkpoint('safe error/retry/direct URL startup/theme/profile')
  await evaluate('window.employeeFixture.failures.push({method:"get",url:"/users"})');await navigate('/admin/users');await text('Unable to load users.');await click('Retry');await until('Boolean(document.querySelector("main li"))')
  const routes=[['/admin/users','User Management'],['/admin/technicians','Technician Management'],['/admin/categories','Category Management'],['/admin/tickets','Ticket Management'],['/admin/sla','SLA Settings'],['/admin/knowledge-base','Knowledge Base Management'],['/admin/notifications','Notifications'],['/admin/analytics','Analytics Dashboard'],['/admin/reports','Reports'],['/admin/audit-logs','Audit Logs'],['/admin/profile',admin.email]]
  for(const [route,label] of routes){await navigate(route);await text(label);await reload();await text(label);await until('window.employeeFixture.hasToken()');assert.equal(await evaluate('location.hash'),'#'+route)}
  assert.equal(await evaluate('localStorage.getItem("supportflow-theme")'),'dark');await text(admin.email)

  checkpoint('mobile sidebar/responsive tables/keyboard')
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:640,deviceScaleFactor:1,mobile:true})
  const openDrawer=async()=>{await evaluate(`document.querySelector('button[aria-label="Open navigation menu"]').click()`);await until('Boolean(document.querySelector("dialog[open]"))')}
  await openDrawer();assert.equal(await evaluate('document.body.style.overflow'),'hidden');assert.equal(await evaluate(`(()=>{const scroller=document.querySelector('dialog[open] .overflow-y-auto');return scroller.scrollHeight>scroller.clientHeight&&getComputedStyle(scroller).overflowY==='auto'})()`),true);await key('Tab');await key('Tab',true);assert.equal(await evaluate('document.querySelector("dialog[open]").contains(document.activeElement)'),true);await key('Escape');await until('!document.querySelector("dialog[open]")')
  await openDrawer();await send('Input.dispatchMouseEvent',{type:'mousePressed',x:370,y:400,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:370,y:400,button:'left',clickCount:1});await until('!document.querySelector("dialog[open]")')
  await openDrawer();await evaluate(`document.querySelector('dialog[open] a[href="#/admin/users"]').click()`);await until('!document.querySelector("dialog[open]")');assert.equal(await evaluate('document.body.style.overflow'),'')
  for(const width of [320,375,430]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});for(const [route,label] of routes.filter(([r])=>['/admin/users','/admin/technicians','/admin/tickets','/admin/reports','/admin/audit-logs'].includes(r))){await navigate(route);await text(label);await until('!document.querySelector("main")?.textContent.includes("Loading")');if(route==='/admin/reports'){await fill('#report-search',title);await submit('#report-search');await text(ticket.ticketNumber)}assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true);assert.equal(await evaluate('document.querySelector("main").textContent.includes("Invalid Date")'),false)}}

  checkpoint('expiry/logout/re-login/failed refresh')
  const expired=require('../../server/node_modules/jsonwebtoken').sign({type:'access',role:'ADMIN'},process.env.JWT_ACCESS_SECRET,{subject:admin.id,algorithm:'HS256',expiresIn:-1})
  await evaluate(`window.employeeFixture.expireAccess(${JSON.stringify(expired)});location.hash='#/admin'`);await text('Recent tickets');await until('!document.body.textContent.includes("Loading dashboard")');assert.ok(await evaluate('window.employeeFixture.hasToken()'))
  await click('Logout');await until('location.hash==="#/login"');assert.equal(await evaluate('window.employeeFixture.hasToken()'),false)
  await fill('#login-email',admin.email);await fill('#login-password',fixture.password);await submit('#login-email');await until('location.hash==="#/admin"');await text('Recent tickets');await until('!document.body.textContent.includes("Loading dashboard")')
  await fixture.connection.execute('UPDATE refresh_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?',[admin.id]);await evaluate(`window.employeeFixture.expireAccess(${JSON.stringify(expired)});location.hash='#/admin/users'`);await until('location.hash==="#/login"');assert.equal(await evaluate('window.employeeFixture.hasToken()'),false);assert.equal(await evaluate('Boolean(document.querySelector("#audit-action"))'),false)
  assert.deepEqual(faults,[])
  console.log(`PASS: ${checkpoints} Admin browser/MySQL journey checkpoints; real mutations, audit events, exports, startup/mobile and auth behavior.`)
} catch(error){const line=[...String(error.stack).matchAll(/adminWorkflow\.cdp\.mjs:(\d+)/g)].at(-1)?.[1];const safe=['Browser evaluation failed','CDP command timed out','Expected Admin UI state not reached'].includes(error.message)?error.message:error.name;console.error('Admin workflow failed at '+stage+' (test line '+(line||'unknown')+'; '+safe+'; details suppressed).');if(error.code==='ERR_ASSERTION')console.error(JSON.stringify({actual:['number','boolean'].includes(typeof error.actual)?error.actual:typeof error.actual,expected:['number','boolean'].includes(typeof error.expected)?error.expected:typeof error.expected}));process.exitCode=1}
finally {try{await fixture.cleanup();console.log('Admin fixture data, sessions, audit rows and SLA mutations rolled back; no exports/provider assets retained.')}finally{ws?.close();if(target)await fetch(`http://localhost:${port}/json/close/${target.id}`,{signal:AbortSignal.timeout(5000)})}}
