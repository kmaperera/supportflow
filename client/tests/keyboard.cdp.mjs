import assert from 'node:assert/strict'
const port=process.env.KEYBOARD_CDP_PORT||'9223'
const target=await (await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:5173/tests/keyboard.browser.html`,{method:'PUT'})).json()
const ws=new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
let seq=0;const pending=new Map()
ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const item=pending.get(msg.id);pending.delete(msg.id);if(msg.error)item.reject(Error(msg.error.message));else item.resolve(msg.result)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text+' '+result.result.description);return result.result.value}
const key=async (key,shift=false)=>{const codes={Tab:9,Enter:13,' ':32,Escape:27,ArrowDown:40,ArrowUp:38};const params={key,code:key===' '?'Space':key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0};await send('Input.dispatchKeyEvent',{type:'keyDown',...params,...(key==='Enter'?{text:'\r'}:key===' '?{text:' '}: {})});await send('Input.dispatchKeyEvent',{type:'keyUp',...params});await wait(35)}
const focus=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
const active=()=>evaluate('document.activeElement.id')
try{
 await send('Page.bringToFront')
 for(let i=0;i<100;i++){if(await evaluate('Boolean(window.ready&&document.querySelector("#search"))'))break;await wait(100)}
 for(const width of [375,768,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
  for(const dark of [false,true]){
   if (await evaluate('document.documentElement.classList.contains("dark")') !== dark) { await focus('header button'); await key('Enter') }
   await focus('a[href="#main-content"]');await key('Enter');assert.equal(await active(),'main-content','skip link target')
   await focus('header button');const before=await evaluate('document.documentElement.classList.contains("dark")');await key('Enter');assert.notEqual(await evaluate('document.documentElement.classList.contains("dark")'),before,'theme Enter')
   await key(' ');assert.equal(await evaluate('document.documentElement.classList.contains("dark")'),before,'theme Space')
   assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'solid','visible outline')
   await focus('#search');await key('Tab');assert.equal(await active(),'status');await key('ArrowDown');await key('Tab');assert.equal(await active(),'submit')
   await key('Enter');assert.equal(await active(),'search','invalid form focus')
   await focus('button:has(+ button[disabled])');const clear=await evaluate('testState.clear');await key('Enter');await key(' ');assert.equal(await evaluate('testState.clear'),clear+2,'single native activations')
   await key('Tab');assert.equal(await evaluate('document.activeElement.getAttribute("role")'),'combobox','disabled clear skipped')
   await key('ArrowUp');assert.equal(await evaluate('document.getElementById(document.activeElement.getAttribute("aria-activedescendant")).textContent'),'Zoe','ArrowUp starts at last')
   await key('Enter');assert.equal(await evaluate('testState.selected'),'3');await key('Escape');await key('Enter');assert.equal(await evaluate('document.activeElement.getAttribute("aria-expanded")'),'true','Enter reopens')
   await key('Escape');await key('ArrowDown');await key('Enter');assert.equal(await evaluate('testState.selected'),'2','closed Down selects first eligible')
   await key(' ');assert.equal(await evaluate('document.activeElement.getAttribute("aria-expanded")'),'true','Space reopens')
   await key('Tab');assert.equal(await active(),'after-combo');assert.equal(await evaluate('Boolean(document.querySelector("[role=listbox]"))'),false,'Tab closes')
   await focus('#reply');await send('Input.insertText',{text:'first'});await key('Enter');await send('Input.insertText',{text:'second'});assert.ok((await evaluate('document.querySelector("#reply").value')).includes('\n'),'textarea newline')
   await key('Tab');assert.equal(await active(),'file','native upload reachable')
   await focus('#dialog-trigger');await key('Enter');assert.equal(await evaluate('document.activeElement.textContent'),'Cancel','safe initial focus')
   await key('Tab',true);assert.equal(await evaluate('document.activeElement.textContent'),'Confirm','reverse trap')
   await key('Tab');assert.equal(await evaluate('document.activeElement.textContent'),'Cancel','forward trap')
   await key('Escape');assert.equal(await active(),'dialog-trigger','restore opener')
   await key('Enter');await key('Tab');await key('Enter');const count=await evaluate('testState.confirms');await key('Escape');await key('Tab');assert.equal(await evaluate('document.activeElement.tagName'),'DIALOG','pending focus contained');assert.equal(await evaluate('testState.confirms'),count)
   await evaluate('window.finish()');await wait(60);assert.equal(await active(),'dialog-trigger','success restore')
   await focus('#details');await key('Enter');assert.equal(await evaluate('document.querySelector("details").open'),true);await key('Enter');assert.equal(await evaluate('document.querySelector("details").open'),false)
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'responsive overflow')
  }
 }
 await focus('nav > div > button:last-child');await key('Enter');assert.equal(await evaluate('testState.page'),2,'pagination Enter')
 await focus('#remove');await key(' ');assert.equal(await active(),'main-content','removed row recovery')
 await focus('#card');await key('Enter');await wait(80);assert.equal(await active(),'main-content','route focus');assert.equal(await evaluate('document.querySelector("h1").textContent'),'Ticket details')
 for(const role of ['employee','technician','admin'])for(const width of [375,768,1440]){
  await send('Page.navigate',{url:`http://127.0.0.1:5173/tests/keyboard.browser.html?role=${role}`})
  await wait(150)
  for(let i=0;i<50;i++){if(await evaluate(`Boolean(document.querySelector('#${role}-navigation'))`))break;await wait(100)}
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
  await wait(50)
  await focus('a[href="#main-content"]');await key('Tab')
  if(width<1024){
   assert.equal(await evaluate('document.activeElement.getAttribute("aria-controls")'),`${role}-navigation`,'mobile menu reachable')
   await key('Tab');assert.ok((await evaluate('document.activeElement.getAttribute("aria-label")')).startsWith('Switch to'),'hidden nav skipped')
   await focus(`button[aria-controls="${role}-navigation"]`);await key('Enter');await key('Tab');assert.equal(await evaluate('document.activeElement.tagName'),'A','opened nav reachable')
   await key('Escape');assert.equal(await evaluate('document.activeElement.getAttribute("aria-controls")'),`${role}-navigation`,'menu Escape restores trigger')
   await key('Enter')
  }else assert.equal(await evaluate('document.activeElement.tagName'),'A','desktop sidebar Tab')
  await focus(width<1024?'dialog[open] nav a':'aside nav a');await key('Enter');await wait(70);assert.equal(await active(),'main-content','role route main focus')
  if(width<1024){await focus(`button[aria-controls="${role}-navigation"]`);await key('Enter')}
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Logout'&&b.getClientRects().length).focus()`)
  await key(' ');assert.equal(await evaluate('testState.logout'),1,'native logout once')
 }
 console.log('PASS: all three role shells: sidebar tab order, collapsed links skipped, menu Escape, route focus and Logout at 375/768/1440px.')
 console.log('PASS: trusted Tab/Shift+Tab/Enter/Space/Escape/arrows; theme, skip, fields, clear, combobox, dialog pending/trap/restore, textarea, file, details, pagination, removal and route focus; 375/768/1440px light/dark.')
}finally{await send('Page.close');ws.close()}
