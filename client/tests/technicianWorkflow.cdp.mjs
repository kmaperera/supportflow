// Technician-only real UI/HTTP/MySQL journey; reuses the 19.4 test bootstrap.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const fixture = await require('../../server/tests/helpers/employeeWorkflowFixture')({ includeTechnicianB:true })
console.log('Technician fixture ready.')
const [employee, , technician, admin, otherTechnician] = fixture.users
let ws,target,stage='setup',checkpoints=0
const faults=[], port=process.env.KEYBOARD_CDP_PORT||'9223'
const base='http://localhost:5173/tests/technicianWorkflow.browser.html'
try {
  const api=fixture.request
  employee.token=(await api(null,'POST','/auth/login',{email:employee.email,password:fixture.password})).data.accessToken
  assert.ok(fixture.priorities.length>1,'Two active seeded priorities/SLA policies required')
  const body={categoryId:fixture.categoryId,priorityId:String(fixture.priority.id),title:'Technician printer & <diagnostic> fixture',description:'Harmless "quoted" printer diagnostic & long technician-readable text. '.repeat(14)}
  const queueTicket=(await api(employee,'POST','/tickets',body,201)).data.ticket
  const otherTicket=(await api(employee,'POST','/tickets',{...body,title:'Other technician protected fixture'},201)).data.ticket
  await api(admin,'PATCH',`/tickets/${otherTicket.id}/assign`,{technicianId:otherTechnician.id})
  const id=String(queueTicket.id)
  target=await(await fetch(`http://localhost:${port}/json/new?about:blank`,{method:'PUT'})).json()
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
  let sequence=0;const pending=new Map()
  ws.onmessage=event=>{
    const message=JSON.parse(event.data)
    if(message.method==='Runtime.exceptionThrown')faults.push('Uncaught browser exception')
    if(message.method==='Runtime.consoleAPICalled'&&['warning','error'].includes(message.params.type))faults.push('Browser console warning/error')
    if(message.method==='Network.loadingFailed'&&message.params.corsErrorStatus)faults.push('CORS failure')
    if(!message.id)return
    const call=pending.get(message.id);pending.delete(message.id);if(!call)return;clearTimeout(call.timer)
    if(message.error)call.reject(Object.assign(Error('CDP command failed'),{code:message.error.code}));else call.resolve(message.result)
  }
  const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++sequence;const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('CDP command timed out'))},10000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({id:requestId,method,params}))})
  async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('Browser evaluation failed');return result.result.value}
  async function until(expression){for(let i=0;i<400;i++){try{if(await evaluate(expression))return}catch(error){if(error.code!==-32000)throw error}await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Expected Technician UI state not reached')}
  const text=value=>until(`document.body.textContent.includes(${JSON.stringify(value)})`)
  const navigate=async route=>{await evaluate(`location.hash=${JSON.stringify('#'+route)}`);await until(`location.hash===${JSON.stringify('#'+route)}`)}
  const reload=async()=>{const previous=await evaluate('window.employeeFixture.realm');await send('Page.reload',{ignoreCache:true});await until(`window.employeeFixture?.realm&&window.employeeFixture.realm!==${JSON.stringify(previous)}`)}
  const fill=async(selector,value)=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);await send('Input.insertText',{text:value})}
  const click=label=>evaluate(`[...document.querySelectorAll('button')].find(b=>(b.textContent.trim()===${JSON.stringify(label)}||(${JSON.stringify(label)}==='View Ticket'&&b.textContent.trim().startsWith('View Ticket')))&&!b.disabled).click()`)
  const choose=async(selector,value)=>evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(String(value))};element.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  const key=async(value,shift=false)=>{const codes={Enter:13,' ':32,Escape:27,Tab:9};const params={key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:codes[value],modifiers:shift?8:0};await send('Input.dispatchKeyEvent',{type:'keyDown',...params,...(value===' '?{text:' '}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',...params})}
  const checkpoint=name=>{stage=name;checkpoints++;console.log('Checking: '+name)}
  await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Page.bringToFront')
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false})
  await send('Network.clearBrowserCookies');await send('Page.navigate',{url:base+'#/login'})
  await until('Boolean(document.getElementById("login-email"))')
  checkpoint('login/empty scoped dashboard and list')
  await fill('#login-email',technician.email);await fill('#login-password',fixture.password);await evaluate('document.querySelector("form").requestSubmit()')
  await until('location.hash==="#/technician"');await text('Welcome back');await text('Recent Assigned Tickets')
  assert.equal(await evaluate(`Boolean(document.querySelector('nav[aria-label="Technician navigation"]'))`),true)
  assert.equal(await evaluate('[...document.querySelectorAll("nav a")].some(a=>a.getAttribute("href").includes("/admin"))'),false)
  assert.equal((await api(technician,'GET','/dashboard/technician/summary')).data.summary.activeAssignedTickets,0)
  await navigate('/technician/tickets/assigned');await text("You don't have any assigned tickets right now.")
  checkpoint('unassigned queue/filter/sort and self-assignment')
  await navigate('/technician/tickets/unassigned');await until('Boolean(document.querySelector("input[type=search]"))')
  await fill('input[type=search]',queueTicket.ticketNumber);await click('Search');await until(`Boolean(document.getElementById('ticket-card-number-${id}'))`)
  assert.equal(await evaluate(`Boolean(document.getElementById('ticket-card-number-${otherTicket.id}'))`),false)
  await fill('input[type=search]','No match & <queue>');await click('Search');await text('No unassigned tickets match');await click('Clear filters')
  await fill('input[type=search]',queueTicket.ticketNumber);await click('Search');await until(`Boolean(document.getElementById('ticket-card-number-${id}'))`)
  await until('document.querySelectorAll("form select").length===4&&!document.querySelectorAll("form select")[1].disabled')
  await choose('form select','OPEN')
  for(const [index,value] of [[1,fixture.categoryId],[2,fixture.priority.id],[3,'created_at:asc'],[3,'created_at:desc']]){await evaluate(`(()=>{const element=document.querySelectorAll('form select')[${index}];element.value=${JSON.stringify(String(value))};element.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`Boolean(document.getElementById('ticket-card-number-${id}'))`)}
  await api(technician,'POST',`/tickets/${id}/self-assign`,{technicianId:otherTechnician.id},422)
  await navigate('/technician/tickets/'+id);await text('Unassigned')
  assert.equal(await evaluate('Boolean(document.querySelector("#public-reply")||document.querySelector("#internal-note")||document.querySelector("#ticket-attachment"))'),false)
  await navigate('/technician/tickets/unassigned');await until('Boolean(document.querySelector("input[type=search]"))');await fill('input[type=search]',queueTicket.ticketNumber);await click('Search');await until(`Boolean(document.getElementById('ticket-card-number-${id}'))`)
  await evaluate(`(()=>{window.employeeFixture.delay=250;const button=document.querySelector('button[aria-label="Assign to me: ${queueTicket.ticketNumber}"]');button.click();button.click();})()`)
  await until(`document.querySelector('button[aria-label="Assigning: ${queueTicket.ticketNumber}"]')?.disabled`)
  await text('assigned to you successfully');await evaluate('window.employeeFixture.delay=0')
  await until(`!document.getElementById('ticket-card-number-${id}')`)
  const assigned=(await api(technician,'GET',`/tickets/${id}`)).data.ticket;assert.equal(String(assigned.assignedTo),technician.id)
  const [assignments]=await fixture.connection.execute('SELECT COUNT(*) AS total FROM ticket_assignments WHERE ticket_id=?',[id]);assert.equal(Number(assignments[0].total),1)
  assert.equal(await evaluate(`window.employeeFixture.requests.filter(r=>r.method==='post'&&r.url==='/tickets/${id}/self-assign').length`),1)
  await api(otherTechnician,'POST',`/tickets/${id}/self-assign`,{},409)
  checkpoint('assigned workspace and valid status actions')
  await navigate('/technician/tickets/assigned');await until(`Boolean(document.getElementById('ticket-card-number-${id}'))`)
  await evaluate(`document.querySelector('a[aria-labelledby^="ticket-card-number-${id}"]').focus()`);await key('Enter');await until(`location.hash==='#/technician/tickets/${id}'`)
  await text('Assigned to you');await text('Response SLA');await until('Boolean(document.querySelector("#public-reply"))')
  assert.equal(await evaluate('Boolean(document.querySelector("[role=combobox]"))'),false)
  await click('Start Work');await until('[...document.querySelectorAll("button")].some(b=>b.textContent==="Wait for User")')
  await click('Wait for User');await until('[...document.querySelectorAll("button")].some(b=>b.textContent==="Resume Work")')
  await click('Resume Work');await until('[...document.querySelectorAll("button")].some(b=>b.textContent==="Wait for User")')
  await api(technician,'PATCH',`/tickets/${id}/status`,{status:'ASSIGNED'},422)
  await api(technician,'PATCH',`/tickets/${id}/status`,{status:'IN_PROGRESS'},409)
  checkpoint('priority/SLA countdown/warning/breach')
  const beforePriority=(await api(technician,'GET',`/tickets/${id}`)).data.ticket
  const priority=fixture.priorities[1]
  await until(`Boolean(document.querySelector('section[aria-labelledby="ticket-priority-heading"] select'))`)
  await choose('section[aria-labelledby="ticket-priority-heading"] select',priority.id);await click('Update Priority');await text('Priority updated successfully')
  const afterPriority=(await api(technician,'GET',`/tickets/${id}`)).data.ticket
  assert.equal(String(afterPriority.priority.id),String(priority.id));assert.notEqual(afterPriority.resolutionDueAt,beforePriority.resolutionDueAt)
  await api(technician,'PATCH',`/tickets/${id}/priority`,{priorityId:'invalid'},422)
  const now=Date.now();await fixture.connection.execute('UPDATE tickets SET created_at=?,response_due_at=?,resolution_due_at=?,sla_response_breached=FALSE,sla_resolution_breached=FALSE WHERE id=?',[new Date(now-600000),new Date(now+60000),new Date(now+60000),id])
  stage='SLA warning reload';await reload();await text('SLA Warning')
  const timer=()=>evaluate(`document.querySelector('section[aria-labelledby="sla-heading"]').textContent`)
  stage='SLA countdown';const timerBefore=await timer(),requestBefore=await evaluate('window.employeeFixture.requests.length')
  await new Promise(resolve=>setTimeout(resolve,2200));assert.notEqual(await timer(),timerBefore);assert.equal(await evaluate('window.employeeFixture.requests.length'),requestBefore)
  stage='SLA breach reload';await fixture.connection.execute('UPDATE tickets SET response_due_at=?,resolution_due_at=? WHERE id=?',[new Date(Date.now()-1000),new Date(Date.now()-1000),id]);await reload();await text('SLA Breached');await until('Boolean(document.querySelector("#public-reply"))')
  checkpoint('public/internal replies and duplicate prevention')
  await fill('#public-reply','   ');await evaluate('document.querySelector("#public-reply").closest("form").requestSubmit()');await text('Reply is required')
  stage='public reply submit';const reply='Technician public reply & <harmless> "quotes". '.repeat(10).trim()
  await fill('#public-reply',reply);await evaluate('{window.employeeFixture.delay=200;const form=document.querySelector("#public-reply").closest("form");form.requestSubmit();form.requestSubmit()}')
  await until(`document.querySelector('#public-reply')?.value===''&&[...document.querySelectorAll('article p')].some(p=>p.textContent===${JSON.stringify(reply)})`);await evaluate('window.employeeFixture.delay=0')
  stage='internal note submit';await until('document.querySelector("#internal-note")&&!document.querySelector("#internal-note").disabled');const note='Private technician note & <internal> '.repeat(12)
  await fill('#internal-note',note);await evaluate('{const form=document.querySelector("#internal-note").closest("form");form.requestSubmit();form.requestSubmit()}');await text('Internal note added.')
  const [comments]=await fixture.connection.execute('SELECT comment_type,user_id,content FROM ticket_comments WHERE ticket_id=?',[id]);assert.equal(comments.length,2);assert.ok(comments.every(row=>String(row.user_id)===technician.id))
  const employeeComments=(await api(employee,'GET',`/tickets/${id}/comments`)).data.comments;assert.ok(employeeComments.some(row=>row.content===reply));assert.ok(employeeComments.every(row=>row.commentType==='PUBLIC'))
  checkpoint('attachment bytes/filename/uploader')
  const filename='technician & '.repeat(6)+'file.txt'
  await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['Technician download fixture bytes'],${JSON.stringify(filename)},{type:'text/plain'}));const input=document.querySelector('#ticket-attachment');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await evaluate('window.employeeFixture.delay=200;document.querySelector("#ticket-attachment").closest("form").requestSubmit()');await until('document.querySelector("#ticket-attachment").disabled');await text('Attachment uploaded');await evaluate('window.employeeFixture.delay=0');await text(filename)
  await evaluate(`(()=>{let blob;const original=URL.createObjectURL;URL.createObjectURL=value=>{blob=value;return original(value)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.employeeFixture.download=blob.text().then(text=>({name:this.download,text}));return}return click.call(this)};})()`)
  await click('Download');await until('Boolean(window.employeeFixture.download)');assert.deepEqual(await evaluate('window.employeeFixture.download'),{name:filename,text:'Technician download fixture bytes'})
  const files=(await api(technician,'GET',`/tickets/${id}/attachments`)).data.attachments;assert.equal(String(files[0].uploadedBy.id),technician.id)
  checkpoint('resolve validation/error/success/reopened/closed')
  await until('Boolean(document.querySelector("#resolution-summary"))')
  await fill('#resolution-summary','   ');await evaluate('document.querySelector("#resolution-summary").closest("form").requestSubmit()');await until('document.querySelector("#resolution-summary").getAttribute("aria-invalid")==="true"')
  await api(technician,'PATCH',`/tickets/${id}/resolve`,{resolutionSummary:'   '},422);assert.equal((await api(technician,'GET',`/tickets/${id}`)).data.ticket.status,'IN_PROGRESS')
  const resolution='Harmless printer connection restored & verified.'
  await fill('#resolution-summary',resolution)
  await evaluate(`window.employeeFixture.failures.push({method:'patch',url:'/tickets/${id}/resolve'})`);await evaluate('document.querySelector("#resolution-summary").closest("form").requestSubmit()');await text('Unable to resolve ticket')
  assert.equal((await api(technician,'GET',`/tickets/${id}`)).data.ticket.status,'IN_PROGRESS')
  await evaluate('{window.employeeFixture.delay=250;const form=document.querySelector("#resolution-summary").closest("form");form.requestSubmit();form.requestSubmit()}');await until('document.querySelector("#resolution-summary").disabled');await text('Ticket resolved successfully');await text(resolution);await evaluate('window.employeeFixture.delay=0')
  await until('!document.querySelector("#resolution-summary")')
  const resolved=(await api(technician,'GET',`/tickets/${id}`)).data.ticket;assert.equal(resolved.status,'RESOLVED');assert.ok(Number.isFinite(Date.parse(resolved.resolvedAt)))
  await api(technician,'PATCH',`/tickets/${id}/resolve`,{resolutionSummary:resolution},409)
  await api(employee,'PATCH',`/tickets/${id}/reopen`,{});await reload();await until('[...document.querySelectorAll("button")].some(b=>b.textContent==="Resume Work")');await click('Resume Work');await until('[...document.querySelectorAll("button")].some(b=>b.textContent==="Wait for User")')
  await api(technician,'PATCH',`/tickets/${id}/resolve`,{resolutionSummary:resolution});await api(employee,'PATCH',`/tickets/${id}/close`,{});await reload();await text(resolution)
  assert.equal(await evaluate('Boolean(document.querySelector("#public-reply")||document.querySelector("#internal-note")||document.querySelector("#ticket-attachment")||document.querySelector("#resolution-summary"))'),false)
  checkpoint('notifications/realtime/navigation/read-failure')
  await navigate('/technician/notifications');await text('Notifications');await until('!document.body.textContent.includes("Loading notifications")')
  const live=await require('../../server/src/modules/notifications/notification.service').createNotification({userId:technician.id,ticketId:Number(id),type:'PUBLIC_COMMENT',title:'Live technician fixture update',message:'Harmless recipient notification'})
  await new Promise(resolve=>setTimeout(resolve,250));assert.equal(require('../../server/src/modules/notifications/notificationRealtime.service').emitNotification(live),true);await text('Live technician fixture update')
  const requests=await evaluate('window.employeeFixture.requests.length');await click('View Ticket');await until(`location.hash==='#/technician/tickets/${id}'`);assert.ok(await evaluate(`window.employeeFixture.requests.slice(${requests}).some(r=>r.method==='patch'&&r.url.endsWith('/read'))`))
  await navigate('/technician/notifications');await text('View Ticket');const readRequests=await evaluate('window.employeeFixture.requests.length');await click('View Ticket');await until(`location.hash==='#/technician/tickets/${id}'`);assert.equal(await evaluate(`window.employeeFixture.requests.slice(${readRequests}).some(r=>r.method==='patch'&&r.url.endsWith('/read'))`),false)
  await navigate('/technician/notifications');await text('View Ticket');const fail=await require('../../server/src/modules/notifications/notification.service').createNotification({userId:technician.id,ticketId:Number(id),type:'PUBLIC_COMMENT',title:'Unread failed patch fixture',message:'Harmless recipient notification'});require('../../server/src/modules/notifications/notificationRealtime.service').emitNotification(fail);await text('Unread failed patch fixture')
  await evaluate(`window.employeeFixture.failures.push({method:'patch',url:'/notifications/${fail.id}/read'})`);await click('View Ticket');await until(`location.hash==='#/technician/tickets/${id}'`);const [unread]=await fixture.connection.execute('SELECT is_read FROM notifications WHERE id=?',[fail.id]);assert.equal(unread[0].is_read,0)
  checkpoint('workload/profile/theme/mobile/direct routes/session')
  await navigate('/technician/workload');await text('Total assigned (all statuses)');await text('SLA summary')
  const distribution=(await api(technician,'GET','/dashboard/status-distribution')).data.distribution;assert.equal(distribution.reduce((sum,row)=>sum+row.count,0),1)
  checkpoint('assigned and queue pagination/error recovery')
  const pageTitle='Technician pagination '+fixture.run
  for(let index=0;index<11;index++)await api(employee,'POST','/tickets',{...body,title:pageTitle+' '+index},201)
  await navigate('/technician/tickets/unassigned');await until('Boolean(document.querySelector("input[type=search]"))');await fill('input[type=search]',pageTitle);await click('Search');await text('of 11 unassigned tickets')
  await click('Next');await until(`Boolean(document.querySelector('button[aria-label="Go to page 2"][aria-current="page"]'))`);await click('Previous');await until(`Boolean(document.querySelector('button[aria-label="Go to page 1"][aria-current="page"]'))`)
  const pageTickets=(await api(technician,'GET','/tickets/queue?assignment=unassigned&limit=20&search='+encodeURIComponent(pageTitle))).data.tickets
  assert.equal(pageTickets.length,11)
  for(const ticket of pageTickets)await api(admin,'PATCH',`/tickets/${ticket.id}/assign`,{technicianId:technician.id})
  await navigate('/technician/tickets/assigned');await text('of 11 assigned tickets');await click('Next');await until(`Boolean(document.querySelector('button[aria-label="Go to page 2"][aria-current="page"]'))`);await click('Previous');await until(`Boolean(document.querySelector('button[aria-label="Go to page 1"][aria-current="page"]'))`)
  await fill('input[type=search]','No matching assigned & <fixture>');await click('Search');await text('No assigned tickets match');await click('Clear filters');await text('of 11 assigned tickets')
  await until('document.querySelectorAll("form select").length===4&&!document.querySelectorAll("form select")[1].disabled')
  for(const [index,value] of [[0,'ASSIGNED'],[1,fixture.categoryId],[2,fixture.priority.id],[3,'created_at:asc'],[3,'created_at:desc']]){await evaluate(`(()=>{const element=document.querySelectorAll('form select')[${index}];element.value=${JSON.stringify(String(value))};element.dispatchEvent(new Event('change',{bubbles:true}));})()`);await text('of 11 assigned tickets')}
  assert.equal(await evaluate(`Boolean(document.getElementById('ticket-card-number-${otherTicket.id}'))`),false)
  await evaluate(`window.employeeFixture.failures.push({method:'get',url:'/tickets/assigned-to-me'})`);await click('Next');await text('Unable to load tickets');await click('Retry');await until(`Boolean(document.querySelector('button[aria-label="Go to page 2"][aria-current="page"]'))`)
  const [unexpectedAudits]=await fixture.connection.execute("SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id=? AND action NOT IN ('LOGIN_SUCCESS','LOGOUT','LOGIN_FAILED')",[technician.id]);assert.equal(Number(unexpectedAudits[0].total),0)
  checkpoint('direct-route startup refresh')
  for(const [route,label] of [['/technician','Recent Assigned Tickets'],['/technician/tickets/assigned','of 11 assigned tickets'],['/technician/tickets/unassigned','Unassigned Ticket Queue'],['/technician/notifications','Notifications'],['/technician/workload','Total assigned (all statuses)'],['/technician/profile',technician.email]]){await navigate(route);await text(label);await reload();await text(label);await until('window.employeeFixture.hasToken()');assert.equal(await evaluate('location.hash'), '#'+route)}
  checkpoint('profile/theme/mobile/direct routes/session');await navigate('/technician/profile');await text(technician.email)
  if(await evaluate('document.documentElement.classList.contains("dark")')){await evaluate(`document.querySelector('button[aria-label="Switch to light mode"]').click()`);await until('!document.documentElement.classList.contains("dark")')}
  await evaluate(`document.querySelector('button[aria-label="Switch to dark mode"]').focus()`);await key(' ');await until('document.documentElement.classList.contains("dark")');await reload();await text(technician.email);assert.equal(await evaluate('localStorage.getItem("supportflow-theme")'),'dark')
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:844,deviceScaleFactor:1,mobile:true})
  await evaluate(`document.querySelector('button[aria-label="Open navigation menu"]').click()`);await until('Boolean(document.querySelector("dialog[open]"))');assert.equal(await evaluate('document.body.style.overflow'),'hidden');await key('Tab');await key('Tab',true);assert.equal(await evaluate('document.querySelector("dialog[open]").contains(document.activeElement)'),true);await key('Escape');await until('!document.querySelector("dialog[open]")');assert.equal(await evaluate('document.body.style.overflow'),'')
  await evaluate(`document.querySelector('button[aria-label="Open navigation menu"]').click()`);await until('Boolean(document.querySelector("dialog[open]"))');await send('Input.dispatchMouseEvent',{type:'mousePressed',x:370,y:400,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:370,y:400,button:'left',clickCount:1});await until('!document.querySelector("dialog[open]")');assert.equal(await evaluate('document.body.style.overflow'),'')
  await evaluate(`document.querySelector('button[aria-label="Open navigation menu"]').click()`);await until('Boolean(document.querySelector("dialog[open]"))');await evaluate(`document.querySelector('dialog[open] a[href="#/technician/tickets/assigned"]').click()`);await until('!document.querySelector("dialog[open]")');assert.equal(await evaluate('document.body.style.overflow'),'')
  await navigate('/technician/tickets/'+id);await text(resolution)
  for(const width of [320,375,430]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true)}
  await navigate('/technician/tickets/'+otherTicket.id);await text('Ticket not found');assert.equal(await evaluate('document.body.textContent.includes("Other technician protected fixture")'),false)
  const absent='18446744073709551614';const [missing]=await fixture.connection.execute('SELECT id FROM tickets WHERE id=?',[absent]);assert.equal(missing.length,0);await navigate('/technician/tickets/'+absent);await text('Ticket not found')
  const expired=require('../../server/node_modules/jsonwebtoken').sign({type:'access',role:'TECHNICIAN'},process.env.JWT_ACCESS_SECRET,{subject:technician.id,algorithm:'HS256',expiresIn:-1})
  await evaluate(`window.employeeFixture.expireAccess(${JSON.stringify(expired)})`);await navigate('/technician');await text('Recent Assigned Tickets');assert.ok(await evaluate('window.employeeFixture.hasToken()'))
  stage='logout and re-login';await click('Logout');await until('location.hash==="#/login"');assert.equal(await evaluate('window.employeeFixture.hasToken()'),false)
  await until('document.getElementById("login-email")&&!document.getElementById("login-email").disabled');await fill('#login-email',technician.email);await fill('#login-password',fixture.password);await evaluate('document.querySelector("form").requestSubmit()');await until('location.hash.startsWith("#/technician")&&window.employeeFixture.hasToken()')
  stage='re-login dashboard';await text('Recent Assigned Tickets');await until('!document.body.textContent.includes("Loading")');await new Promise(resolve=>setTimeout(resolve,250))
  stage='revoke fixture refresh';await fixture.connection.execute('UPDATE refresh_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?',[technician.id])
  stage='expire second access';await evaluate(`window.employeeFixture.expireAccess(${JSON.stringify(expired)});location.hash='#/technician/tickets/assigned'`)
  stage='failed refresh redirect';await until('location.hash==="#/login"')
  stage='failed refresh cleared state';assert.equal(await evaluate('window.employeeFixture.hasToken()'),false);assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(resolution)})`),false)
  assert.deepEqual(faults,[])
  console.log(`PASS: ${checkpoints} Technician browser/MySQL journey checkpoints; self-assignment, scoped lists/actions, replies/notes, bytes, resolution, SLA, notifications and responsive/session behavior.`)
} catch(error) {const line=[...String(error.stack).matchAll(/technicianWorkflow\.cdp\.mjs:(\d+)/g)].at(-1)?.[1];console.error('Technician workflow failed at '+stage+' (test line '+(line||'unknown')+'; '+error.name+'; details suppressed).');process.exitCode=1}
finally {ws?.close();try{if(target)await fetch(`http://localhost:${port}/json/close/${target.id}`,{signal:AbortSignal.timeout(5000)})}finally{await fixture.cleanup()}console.log('Technician fixture users/tickets/sessions/notifications/audits rolled back; no provider assets or downloaded binaries retained.')}
