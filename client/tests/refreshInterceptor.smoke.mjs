import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
 const {default:api}=await server.ssrLoadModule('/src/api/axios.js')
 const tokens=await server.ssrLoadModule('/src/auth/accessToken.js')
 const bridge=await server.ssrLoadModule('/src/auth/sessionBridge.js')
 let user=null,clears=0
 const unregister=bridge.registerSessionHandlers({establishSession(profile,token){user=profile;tokens.setAccessToken(token)},clearSession(){user=null;clears++;tokens.clearAccessToken()}})
 const fail=(config,status)=>Promise.reject({config,response:{status},isAxiosError:true})
 const ok=(config,data={})=>({config,data,status:200,statusText:'OK',headers:{}})
 let refreshes=0, attempts=0
 tokens.setAccessToken('old')
 api.defaults.adapter=async config=>{
  if(config.url==='/auth/refresh'){refreshes++;await new Promise(r=>setTimeout(r,20));return ok(config,{success:true,data:{user:{role:'ADMIN',mustChangePassword:true},accessToken:'new'}})}
  attempts++
  assert.equal(config.method,'patch');assert.equal(config.data,'{"title":"unchanged"}');assert.deepEqual(config.params,{id:3});assert.equal(config.headers.get('X-Test'),'retained')
  return config.headers.get('Authorization')==='Bearer new'?ok(config):fail(config,401)
 }
 await Promise.all(Array.from({length:3},()=>api.patch('/tickets/3',{title:'unchanged'},{params:{id:3},headers:{'X-Test':'retained'}})))
 assert.equal(refreshes,1);assert.equal(attempts,6);assert.equal(user.mustChangePassword,true)
 for(const [url,status] of [['/auth/login',401],['/auth/refresh',401],['/auth/logout',401],['/auth/logout-all',401],['/reports/tickets',403],['/tickets',422],['/tickets',500]]){
  let calls=0;api.defaults.adapter=config=>{calls++;return fail(config,status)}
  await assert.rejects(api.get(url),e=>e.response.status===status);assert.equal(calls,1)
 }
 tokens.setAccessToken('expired');refreshes=0
 api.defaults.adapter=async config=>{if(config.url==='/auth/refresh'){refreshes++;await new Promise(r=>setTimeout(r,20))}return fail(config,401)}
 const failed=await Promise.allSettled([api.get('/a'),api.get('/b')]);assert.ok(failed.every(r=>r.status==='rejected'));assert.equal(refreshes,1);assert.equal(clears,1);assert.equal(tokens.getAccessToken(),null);assert.equal(user,null)
 // A fresh session can recover after the failed lock was released. Retry 401 stops.
 tokens.setAccessToken('old');refreshes=0;attempts=0
 api.defaults.adapter=async config=>{if(config.url==='/auth/refresh'){refreshes++;return ok(config,{success:true,data:{user:{role:'EMPLOYEE'},accessToken:'new'}})}attempts++;return fail(config,401)}
 await assert.rejects(api.get('/always-401'));assert.equal(refreshes,1);assert.equal(attempts,2)
 unregister();tokens.clearAccessToken()
 console.log('401 retry/concurrency, auth exclusions, 403 passthrough, config preservation and failure cleanup passed.')
} finally {await server.close()}
