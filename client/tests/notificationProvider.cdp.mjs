// Actual React effects/StrictMode/router; mocked socket and HTTP boundaries only.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
const socketFixture = `
export function io(origin, options) {
  const handlers = new Map();
  const socket = { origin, options, handlers, closed: false,
    on(event, callback) { handlers.set(event, callback) },
    off(event, callback) { if (handlers.get(event) === callback) handlers.delete(event) },
    disconnect() { this.closed = true },
  };
  window.sockets.push(socket);
  window.maxActive = Math.max(window.maxActive, window.sockets.filter(s => !s.closed).length);
  return socket;
}`
const harness = `
import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '/src/auth/AuthContext';
import { ToastContext } from '/src/components/toastContext';
import NotificationRealtimeProvider from '/src/auth/NotificationRealtimeProvider';
import { useNotificationRealtime } from '/src/auth/notificationRealtimeContext';
import api from '/src/api/axios';
window.sockets=[]; window.maxActive=0; window.restCalls=0; window.warningCount=0;
const toast={warning(){window.warningCount++}};
api.defaults.adapter=async config=>{
 window.restCalls++;
 return {status:200,statusText:'OK',headers:{},config,data:{success:true,data:{notifications:[],unreadCount:3,pagination:{page:1,totalPages:1}}}};
};
function Page(){
 const state=useNotificationRealtime();const location=useLocation();const navigate=useNavigate();
 useEffect(()=>{window.go=navigate},[navigate]);
 return <p id="state" data-revision={state.revision} data-unread={state.unreadCount}>{location.pathname}</p>;
}
function Harness(){
 const [auth,setAuth]=useState({user:null,accessToken:null});
 const [epoch,setEpoch]=useState(0);
 useEffect(()=>{window.setAuth=setAuth;window.remount=()=>setEpoch(v=>v+1);window.ready=true},[]);
 return <AuthContext.Provider value={auth}><ToastContext.Provider value={toast}>
 <NotificationRealtimeProvider key={epoch}><Page/></NotificationRealtimeProvider>
 </ToastContext.Provider></AuthContext.Provider>;
}
createRoot(document.getElementById('root')).render(<StrictMode><MemoryRouter><Harness/></MemoryRouter></StrictMode>);
`
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'notification-lifecycle-fixtures', enforce: 'pre',
  resolveId(source, importer) {
    if (source === 'socket.io-client' && importer?.endsWith('/src/api/notificationRealtime.js')) return '\0socket-fixture'
    if (source === '/__realtime-harness.jsx') return source
  },
  load(id) { if (id === '\0socket-fixture') return socketFixture; if (id === '/__realtime-harness.jsx') return harness },
  configureServer(server) { server.middlewares.use('/__realtime-test', (_req, res, next) => {
    server.transformIndexHtml('/__realtime-test', '<div id="root"></div><script type="module" src="/__realtime-harness.jsx"></script>').then(html => {
      res.setHeader('Content-Type', 'text/html');res.end(html)
    }).catch(next)
  }) },
}] })
let ws, target
const port = process.env.KEYBOARD_CDP_PORT || '9259'
try {
  await vite.listen()
  target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve;ws.onerror = reject })
  let sequence = 0
  const pending = new Map()
  ws.onmessage = event => { const m=JSON.parse(event.data);if(!m.id)return;const call=pending.get(m.id);pending.delete(m.id);if(m.error)call.reject(Error('CDP failed'));else call.resolve(m.result) }
  const send = (method, params={}) => new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
  const evaluate = async expression => { const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error('Browser evaluation failed');return value.result.value }
  const until = async expression => { for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50))}throw Error('Expected lifecycle state not reached: '+expression) }
  await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__realtime-test`})
  await until('window.ready===true')
  assert.equal(await evaluate('window.sockets.length'),0)
  for (const role of ['ADMIN','TECHNICIAN','EMPLOYEE']) {
    await evaluate(`window.setAuth({user:{id:'7',role:${JSON.stringify(role)},mustChangePassword:false},accessToken:'fixture-one'})`)
    await until('window.sockets.filter(s=>!s.closed).length===1')
    const count=await evaluate('window.sockets.length')
    await evaluate(`window.go('/${role.toLowerCase()}/users')`)
    await until(`document.querySelector('#state').textContent==='/${role.toLowerCase()}/users'`)
    assert.equal(await evaluate('window.sockets.length'),count)
    assert.equal(await evaluate('window.sockets.at(-1).options.auth.token'),'fixture-one')
    const before=await evaluate('window.restCalls')
    await evaluate(`window.sockets.at(-1).handlers.get('connect')()`)
    await until(`window.restCalls>${before}`)
    await until(`document.querySelector('#state').dataset.unread==='3'`)
    const received=await evaluate('window.restCalls')
    await evaluate(`window.sockets.at(-1).handlers.get('notification:new')({id:'91',type:'SLA_WARNING'})`)
    await until(`window.restCalls>${received}`)
    const focused=await evaluate('window.restCalls')
    await evaluate(`window.dispatchEvent(new Event('focus'))`)
    await until(`window.restCalls>${focused}`)
    await evaluate(`window.setAuth({user:{id:'7',role:${JSON.stringify(role)},mustChangePassword:false},accessToken:'fixture-two'})`)
    await until(`window.sockets.at(-1).options.auth.token==='fixture-two'`)
    assert.equal(await evaluate('window.sockets.filter(s=>!s.closed).length'),1)
    assert.equal(await evaluate('window.sockets.at(-2).handlers.size'),0)
    await evaluate('window.setAuth({user:null,accessToken:null})')
    await until('window.sockets.every(s=>s.closed)')
    const ended=await evaluate('window.restCalls')
    await evaluate(`window.dispatchEvent(new Event('focus'));new Promise(r=>setTimeout(r,200))`)
    assert.equal(await evaluate('window.restCalls'),ended)
  }
  // An initially authenticated StrictMode mount must also clean its replayed effect.
  await evaluate(`window.setAuth({user:{id:'7',role:'ADMIN',mustChangePassword:false},accessToken:'strict-fixture'})`)
  await until('window.sockets.filter(s=>!s.closed).length===1')
  const strictBefore=await evaluate('window.sockets.length')
  await evaluate('window.remount()')
  await until(`window.sockets.length>=${strictBefore + 2}`)
  assert.equal(await evaluate('window.sockets.filter(s=>!s.closed).length'),1)
  await evaluate('window.setAuth({user:null,accessToken:null})')
  await until('window.sockets.every(s=>s.closed)')
  assert.equal(await evaluate('window.maxActive'),1)
  assert.equal(await evaluate('window.warningCount'),2)
  console.log('PASS: actual React StrictMode provider, all roles, route stability, token replacement, logout, event handling and reconnect/focus REST recovery.')
} finally {
  ws?.close()
  if(target)await fetch(`http://localhost:${port}/json/close/${target.id}`)
  await vite.close()
}
