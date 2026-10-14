// Actual Admin App/UI + native HTTP + local MySQL; reuse the 19.4 bootstrap.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const fixture=await require('../../server/tests/helpers/adminWorkflowFixture')()
const [employee,,technician,admin,otherTechnician]=fixture.users
const api=fixture.request,port=process.env.KEYBOARD_CDP_PORT||'9228'
let ws,target,stage='setup',checkpoints=0
const faults=[]
try {
  employee.token=(await api(null,'POST','/auth/login',{email:employee.email,password:fixture.password})).data.accessToken
  const title='Admin workflow '+fixture.run
  const ticketBody={title,description:'Harmless Admin ticket description & <quoted> content. '.repeat(14),categoryId:fixture.categoryId,priorityId:String(fixture.priority.id)}
  const ticket=(await api(employee,'POST','/tickets',ticketBody,201)).data.ticket,id=String(ticket.id)
  const auditCount=async(action,entityId)=>{
    const [rows]=await fixture.connection.execute('SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id=? AND action=? AND entity_id=?',[admin.id,action,String(entityId)])
    return Number(rows[0].total)
  }
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
  async function until(expression){for(let i=0;i<400;i++){try{if(await evaluate(expression))return}catch(error){if(error.code!==-32000)throw error}await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Expected Admin UI state not reached')}
  const text=value=>until(`document.body.textContent.includes(${JSON.stringify(value)})`)
  const navigate=route=>evaluate(`location.hash=${JSON.stringify('#'+route)}`)
  const reload=async()=>{const previous=await evaluate('window.employeeFixture.realm');await send('Page.reload',{ignoreCache:true});await until(`window.employeeFixture?.realm&&window.employeeFixture.realm!==${JSON.stringify(previous)}`)}
  const fill=async(selector,value)=>{await until(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);await send('Input.insertText',{text:value})}
  const click=async(label,scope='document')=>{const candidate=`[...${scope}?.querySelectorAll('button')||[]].find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.textContent.trim().startsWith(${JSON.stringify(label+' ')} )||(${JSON.stringify(label)}==='View Ticket'&&b.textContent.trim().startsWith('View Ticket:')))&&!b.disabled)`;await until(`Boolean(${candidate})`);return evaluate(`${candidate}.click()`)}
  const submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('form').requestSubmit()`)
  const key=async(value,shift=false)=>{const codes={Enter:13,' ':32,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38};const params={key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:codes[value],modifiers:shift?8:0};await send('Input.dispatchKeyEvent',{type:'keyDown',...params,...([' ','Enter'].includes(value)?{text:value==='Enter'?'\r':' '}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',...params})}
  const checkpoint=name=>{stage=name;checkpoints++;console.log('Checking: '+name)}
  const dialog='document.querySelector("dialog[open]")'
  const confirm=async label=>{await until('Boolean(document.querySelector("dialog[open]"))');await click(label,dialog)}
  await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Page.bringToFront')
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false})
  await send('Network.clearBrowserCookies');await send('Page.navigate',{url:'http://localhost:5173/tests/adminWorkflow.browser.html#/login'})
  checkpoint('assignment login and initial assignment')
  await fill('#login-email',admin.email);await fill('#login-password',fixture.password);await submit('#login-email');await until('location.hash==="#/admin"')
  await navigate('/admin/tickets/'+id);await text('Assignment');await text('Unassigned')
  async function selectTechnician(person){await fill('input[role=combobox]',person.email);await until('document.querySelectorAll("[role=option]").length===1');await key('ArrowDown');await key('Enter');await click('Continue');await until('Boolean(document.querySelector("dialog[open]"))')}
  await click('Assign technician');await selectTechnician(technician);await confirm('Assign Technician');await text('Ticket assigned successfully.')
  let current=(await api(admin,'GET','/tickets/'+id)).data.ticket
  assert.equal(String(current.assignedTo),technician.id)
  checkpoint('stale reassignment confirmation retains original ID')
  await click('Reassign');await selectTechnician(otherTechnician)
  await api(admin,'PATCH',`/tickets/${id}/unassign`,{expectedAssignmentId:current.assignment.id})
  await api(admin,'PATCH',`/tickets/${id}/assign`,{technicianId:technician.id})
  const replacement=(await api(admin,'GET','/tickets/'+id)).data.ticket
  assert.notEqual(String(replacement.assignment.id),String(current.assignment.id))
  const before=await auditCount('TICKET_REASSIGNED',id)
  const [oldRows]=await fixture.connection.execute('SELECT * FROM ticket_assignments WHERE ticket_id=? ORDER BY id',[id])
  await confirm('Reassign Ticket');await text('Ticket assignment has changed. Refresh and try again.')
  current=(await api(admin,'GET','/tickets/'+id)).data.ticket
  assert.equal(String(current.assignment.id),String(replacement.assignment.id));assert.equal(String(current.assignedTo),technician.id)
  const [newRows]=await fixture.connection.execute('SELECT * FROM ticket_assignments WHERE ticket_id=? ORDER BY id',[id]);assert.deepEqual(newRows,oldRows)
  assert.equal(await auditCount('TICKET_REASSIGNED',id),before)
  checkpoint('fresh reassignment and unassignment refresh details/history')
  await fill('input[role=combobox]',otherTechnician.email);await until('document.querySelectorAll("[role=option]").length===1');await key('ArrowDown');await key('Enter');await click('Continue');await confirm('Reassign Ticket');await text('Ticket reassigned successfully.')
  current=(await api(admin,'GET','/tickets/'+id)).data.ticket;assert.equal(String(current.assignedTo),otherTechnician.id);assert.equal(await auditCount('TICKET_REASSIGNED',id),before+1)
  await click('Unassign');await confirm('Unassign Ticket');await text('Ticket unassigned successfully.')
  current=(await api(admin,'GET','/tickets/'+id)).data.ticket;assert.equal(current.assignedTo,null);assert.equal(current.status,'OPEN')
  await reload();await text('Assignment');await text('Unassigned');await until('Boolean([...document.querySelectorAll("button")].find(b=>b.textContent==="Assign technician"))')
  assert.deepEqual(faults,[])
  console.log(`PASS: ${checkpoints} real-browser assignment regression checkpoints, including stale ABA confirmation and refresh.`)
} catch(error){console.error(JSON.stringify({stage,name:error.name,code:error.code}));process.exitCode=1}
finally{try{await fixture.cleanup()}finally{ws?.close();if(target)await fetch(`http://localhost:${port}/json/close/${target.id}`,{signal:AbortSignal.timeout(5000)})}}
