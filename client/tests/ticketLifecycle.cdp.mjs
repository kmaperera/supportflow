// Lifecycle controls and two real browser tabs over the existing native-HTTP bootstrap.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const fixture=await require('../../server/tests/helpers/lifecycleWorkflowFixture')()
const [employee,,technician,admin]=fixture.users,api=fixture.request
const port=process.env.KEYBOARD_CDP_PORT||'9227',targets=[],faults=[]
let stage='setup',checkpoints=0
try {
  const live=await fixture.create('browser journey'),id=String(live.id)
  await api(admin,'PATCH',`/tickets/${id}/assign`,{technicianId:technician.id})
  async function tab(){
    const target=await(await fetch(`http://localhost:${port}/json/new?about:blank`,{method:'PUT'})).json()
    const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
    const pending=new Map();let sequence=0;targets.push({target,ws})
    ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')faults.push('Uncaught exception');if(message.method==='Runtime.consoleAPICalled'&&['warning','error'].includes(message.params.type))faults.push('Console warning/error');if(message.method==='Network.loadingFailed'&&message.params.corsErrorStatus)faults.push('CORS failure');if(!message.id)return;const call=pending.get(message.id);pending.delete(message.id);if(!call)return;clearTimeout(call.timer);if(message.error)call.reject(Object.assign(Error('CDP command failed'),{code:message.error.code}));else call.resolve(message.result)}
    const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++sequence,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('CDP timeout'))},10000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({id:requestId,method,params}))})
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('Browser evaluation failed');return result.result.value}
    const until=async expression=>{for(let i=0;i<400;i++){try{if(await evaluate(expression))return}catch(error){if(error.code!==-32000)throw error}await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Expected lifecycle UI state not reached')}
    const text=value=>until(`document.body.textContent.includes(${JSON.stringify(value)})`)
    const click=async(label,scope='document')=>{const selector=`[...${scope}?.querySelectorAll('button')||[]].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;await until(`Boolean(${selector})`);return evaluate(`${selector}.click()`)}
    const fill=async(selector,value)=>{await until(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);await send('Input.insertText',{text:value})}
    const navigate=route=>evaluate(`location.hash=${JSON.stringify('#'+route)}`)
    const reload=async()=>{const old=await evaluate('window.employeeFixture.realm');await send('Page.reload',{ignoreCache:true});await until(`window.employeeFixture?.realm&&window.employeeFixture.realm!==${JSON.stringify(old)}`)}
    const has=label=>evaluate(`[...document.querySelectorAll('main button')].some(b=>b.textContent.trim()===${JSON.stringify(label)})`)
    await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Page.bringToFront')
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false})
    return {send,evaluate,until,text,click,fill,navigate,reload,has}
  }
  const a=await tab(),base='http://localhost:5173/tests/ticketLifecycle.browser.html'
  const checkpoint=name=>{stage=name;checkpoints++;console.log('Checking: '+name)}
  const login=async person=>{await a.fill('#login-email',person.email);await a.fill('#login-password',fixture.password);await a.evaluate('document.querySelector("form").requestSubmit()');await a.until(`location.hash===${JSON.stringify('#/'+person.role.toLowerCase())}`)}
  const switchUser=async person=>{await a.click('Logout');await a.until('location.hash==="#/login"');await login(person)}
  const labels={OPEN:'Open',ASSIGNED:'Assigned',IN_PROGRESS:'In Progress',WAITING_FOR_USER:'Waiting for User',RESOLVED:'Resolved',REOPENED:'Reopened',CLOSED:'Closed'}
  const statusUI=async(page,status,ticket)=>{if(ticket)await page.text(ticket.ticketNumber);await page.until(`[...document.querySelectorAll('main dt')].find(d=>d.textContent==='Status')?.nextElementSibling.textContent===${JSON.stringify(labels[status])}`)}
  const historyCount=async()=>Number((await fixture.connection.execute('SELECT COUNT(*) AS total FROM ticket_status_history WHERE ticket_id=?',[id]))[0][0].total)
  const verify=async(status,role='technician')=>{
    await statusUI(a,status,live);assert.equal((await api(admin,'GET','/tickets/'+id)).data.ticket.status,status)
    const my=(await api(employee,'GET','/tickets/my?search='+encodeURIComponent(live.ticketNumber))).data.tickets;assert.equal(my.find(t=>String(t.id)===id).status,status)
    const all=(await api(admin,'GET','/tickets/queue?search='+encodeURIComponent(live.ticketNumber))).data.tickets;assert.equal(all.find(t=>String(t.id)===id).status,status)
    const active=(await api(technician,'GET','/tickets/assigned-to-me?search='+encodeURIComponent(live.ticketNumber))).data.tickets
    assert.equal(active.some(t=>String(t.id)===id),['ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','REOPENED'].includes(status))
    const summary=(await api(technician,'GET','/dashboard/technician/summary')).data.summary
    const [rows]=await fixture.connection.execute("SELECT COUNT(*) AS total FROM tickets WHERE assigned_to=? AND status IN ('ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','REOPENED')",[technician.id]);assert.equal(summary.activeAssignedTickets,Number(rows[0].total))
    await a.reload();await statusUI(a,status,live);assert.equal(await a.evaluate('location.hash'),`#/${role}/tickets/${id}`)
  }
  await a.send('Network.clearBrowserCookies');await a.send('Page.navigate',{url:base+'#/login'});await login(technician)
  checkpoint('Technician controls for every state')
  const expected={OPEN:null,ASSIGNED:'Start Work',IN_PROGRESS:'Wait for User',WAITING_FOR_USER:'Resume Work',RESOLVED:null,REOPENED:'Resume Work',CLOSED:null}
  for(const [status,ticket] of Object.entries(fixture.states)){
    await a.navigate('/technician/tickets/'+ticket.id);await statusUI(a,status,ticket)
    for(const label of ['Start Work','Wait for User','Resume Work'])assert.equal(await a.has(label),label===expected[status])
    assert.equal(await a.evaluate('Boolean(document.querySelector("#resolution-summary"))'),['IN_PROGRESS','WAITING_FOR_USER'].includes(status))
  }
  checkpoint('two-tab stale start-work')
  await a.navigate('/technician/tickets/'+id);await statusUI(a,'ASSIGNED')
  const b=await tab();await b.send('Page.navigate',{url:base+'#/technician/tickets/'+id});await statusUI(b,'ASSIGNED')
  await a.send('Page.bringToFront');await a.click('Start Work');await verify('IN_PROGRESS');const startedHistory=await historyCount()
  await b.send('Page.bringToFront');await b.click('Start Work');await b.text('Ticket is already in the requested status');await statusUI(b,'IN_PROGRESS');assert.equal(await historyCount(),startedHistory)
  checkpoint('waiting/resume persistence')
  await a.send('Page.bringToFront');await a.click('Wait for User');await verify('WAITING_FOR_USER');await a.click('Resume Work');await verify('IN_PROGRESS')
  checkpoint('resolve validation/resolved SLA/stale waiting action')
  await a.fill('#resolution-summary','   ');await a.evaluate('document.querySelector("#resolution-summary").closest("form").requestSubmit()');await a.text('Resolution note is required.');assert.equal((await api(admin,'GET','/tickets/'+id)).data.ticket.status,'IN_PROGRESS')
  await a.fill('#resolution-summary','Browser lifecycle first resolution.');await a.evaluate('document.querySelector("#resolution-summary").closest("form").requestSubmit()');await verify('RESOLVED')
  await a.until('!document.querySelector("main").textContent.includes("Loading")');const timer=await a.evaluate(`document.querySelector('section[aria-labelledby="sla-heading"]').textContent`);assert.ok(timer.includes('Resolved'));await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(await a.evaluate(`document.querySelector('section[aria-labelledby="sla-heading"]').textContent`),timer)
  const resolvedHistory=await historyCount();await b.send('Page.bringToFront');await b.click('Wait for User');await b.text('This status change is no longer available');await statusUI(b,'RESOLVED');assert.equal(await historyCount(),resolvedHistory);assert.equal(await b.has('Wait for User'),false)
  await b.send('Page.close');targets[1].ws.close();targets[1].closed=true
  checkpoint('list consistency/back-forward')
  await a.send('Page.bringToFront');await a.navigate('/technician/tickets/assigned');await a.text('My Assigned Tickets');await a.until('!document.querySelector("main").textContent.includes("Loading")');assert.equal(await a.evaluate(`Boolean(document.getElementById('ticket-card-number-${id}'))`),false)
  await a.evaluate('history.back()');await statusUI(a,'RESOLVED');assert.equal(await a.has('Start Work'),false);await a.evaluate('history.forward()');await a.text('My Assigned Tickets');await a.evaluate('history.back()');await statusUI(a,'RESOLVED')
  checkpoint('Employee eligibility for every state/reopen')
  await switchUser(employee)
  for(const [status,ticket] of Object.entries(fixture.states)){
    await a.navigate('/employee/tickets/'+ticket.id);await statusUI(a,status,ticket)
    assert.equal(await a.has('Edit Ticket'),['OPEN','ASSIGNED'].includes(status));assert.equal(await a.has('Close Ticket'),status==='RESOLVED');assert.equal(await a.has('Reopen Ticket'),status==='RESOLVED')
  }
  await a.navigate('/employee/tickets/'+id);await statusUI(a,'RESOLVED');await a.click('Reopen Ticket');await a.click('Reopen Ticket','document.querySelector("dialog[open]")');await verify('REOPENED','employee');assert.equal(await a.has('Reopen Ticket'),false)
  checkpoint('reopened resume/re-resolution/Employee close')
  await switchUser(technician);await a.navigate('/technician/tickets/'+id);await statusUI(a,'REOPENED');await a.click('Resume Work');await verify('IN_PROGRESS')
  await a.fill('#resolution-summary','Browser lifecycle second resolution.');await a.evaluate('document.querySelector("#resolution-summary").closest("form").requestSubmit()');await verify('RESOLVED')
  await switchUser(employee);await a.navigate('/employee/tickets/'+id);await statusUI(a,'RESOLVED');await a.click('Close Ticket');await a.click('Close Ticket','document.querySelector("dialog[open]")');await verify('CLOSED','employee');assert.equal(await a.has('Reopen Ticket'),false);assert.equal(await a.has('Edit Ticket'),false)
  checkpoint('Admin controlled actions/history/closed immutability')
  await switchUser(admin)
  for(const [status,ticket] of Object.entries(fixture.states)){
    await a.navigate('/admin/tickets/'+ticket.id);await statusUI(a,status,ticket);assert.equal(await a.has('Assign technician')||await a.has('Reassign'),!['RESOLVED','CLOSED'].includes(status));assert.equal(await a.evaluate('Boolean(document.querySelector("main select"))'),false)
  }
  await a.navigate('/admin/tickets/'+id);await statusUI(a,'CLOSED',live);await a.until(`document.querySelector('section[aria-labelledby="status-history-heading"] ol')?.children.length===9`)
  assert.equal(await historyCount(),9);assert.equal(await a.evaluate(`document.querySelector('section[aria-labelledby="status-history-heading"] ol').children.length`),9)
  const result=(await api(admin,'GET','/tickets/'+id)).data.ticket;assert.ok(result.closedAt&&result.resolvedAt);assert.equal(result.resolutionSummary,'Browser lifecycle second resolution.')
  assert.deepEqual(faults,[])
  console.log(`PASS: ${checkpoints} lifecycle browser checkpoints; all-role controls, real two-tab conflicts, F5/back-forward and list/history consistency.`)
}catch(error){const line=[...String(error.stack).matchAll(/ticketLifecycle\.cdp\.mjs:(\d+)/g)].at(-1)?.[1];console.error('Lifecycle browser failed at '+stage+' (line '+(line||'unknown')+'; '+error.name+'; details suppressed).');process.exitCode=1}
finally{try{await fixture.cleanup();console.log('Lifecycle browser rows/history/sessions rolled back.')}finally{for(const item of targets){item.ws.close();if(!item.closed)await fetch(`http://localhost:${port}/json/close/${item.target.id}`,{signal:AbortSignal.timeout(5000)})}}}
