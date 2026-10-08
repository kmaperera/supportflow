const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const matrix = require('./helpers/permissionMatrix.json');
process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.NODE_ENV = 'test';
const cloudPath = require.resolve('../src/config/cloudinary');
require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: {} };
const users = require('../src/modules/users/user.repository');
const pool = require('../src/config/database');
const tokens = require('../src/utils/jwt');
const mounts = { health:'health/health', auth:'auth/auth', users:'users/user', tickets:'tickets/ticket', notifications:'notifications/notification', sla:'sla/slaPolicy', 'knowledge-base':'knowledgeBase/knowledgeBase', dashboard:'dashboard/dashboard', reports:'reports/reports', 'audit-logs':'audit/audit' };

test('all mounted API routes match the reviewed matrix and deny absent/wrong-role credentials before data access', async t => {
  const actors = ['EMPLOYEE','TECHNICIAN','ADMIN'].map((role,i)=>({ id: i+1, role, is_active: 1, must_change_password: 0 }));
  t.mock.method(users, 'findById', async id => actors.find(u=>String(u.id)===id) || null);
  const queries = t.mock.method(pool, 'query', async () => { throw new Error('Unauthorized request reached SQL'); });
  const connections = t.mock.method(pool, 'getConnection', async () => { throw new Error('Unauthorized request reached a transaction'); });
  const app = require('../src/app');
  const actual = [];
  for (const [prefix,module] of Object.entries(mounts)) for (const layer of require(`../src/modules/${module}.routes`).stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) actual.push(`${method.toUpperCase()} /api/v1/${prefix}${layer.route.path==='/'?'':layer.route.path}`);
  }
  assert.deepEqual(actual.sort(), matrix.map(r=>`${r.method} ${r.path}`).sort());
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  let requests=0;
  async function denied(route, token, status) {
    const response=await fetch(base+route.path.replace(/:[A-Za-z]+/g,'1'), {method:route.method, headers:token?{authorization:`Bearer ${token}`}:{}});
    assert.equal(response.status,status,`${route.method} ${route.path}`);
    const text=await response.text(); assert.doesNotMatch(text,/password_hash|secure_url|fileUrl|internal note content/);
    requests++;
  }
  for(const route of matrix) {
    if(['public','cookie/public'].includes(route.access)) continue;
    await denied(route,null,401);
    if(route.access==='authenticated') continue;
    for(const actor of actors) if(!route.access.split('/').includes(actor.role)) {
      // A signed stale ADMIN claim cannot override the current DB role.
      await denied(route,tokens.generateAccessToken({...actor,role:'ADMIN'}),403);
    }
  }
  assert.equal(queries.mock.callCount(),0); assert.equal(connections.mock.callCount(),0);
  t.diagnostic(`${requests} real HTTP denial checks across ${matrix.length} mounted method/path pairs`);
});

test('authentication rejects identity substitution and deactivation; current DB role wins over stale claims', async t => {
  let row={id:'9007199254740993',role:'EMPLOYEE',is_active:1};
  t.mock.method(users,'findById',async()=>row);
  const app=require('express')();
  const authenticate=require('../src/middleware/authenticate');
  app.get('/me',authenticate,(req,res)=>res.json(req.user));
  app.get('/admin',authenticate,require('../src/middleware/authorize')('ADMIN'),(req,res)=>res.json({success:true}));
  app.use(require('../src/middleware/errorHandler'));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.closeAllConnections();server.close();});
  const token=tokens.generateAccessToken({id:row.id,role:'ADMIN'});
  const get=path=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{headers:{authorization:`Bearer ${token}`}});
  assert.equal((await (await get('/me')).json()).id,'9007199254740993');
  assert.equal((await get('/admin')).status,403);
  row={...row,id:'9007199254740992'};
  assert.equal((await get('/me')).status,401);
  row={...row,id:'9007199254740993',is_active:0};
  assert.equal((await get('/me')).status,403);
});

test('Admin self-protection compares exact BIGINT identities without aliasing adjacent users', async t => {
  const service=require('../src/modules/users/user.service');
  t.mock.method(users,'findById',async id=>({id,role:'EMPLOYEE',is_active:1}));
  const status=t.mock.method(users,'updateStatus',async()=>1);
  const role=t.mock.method(users,'updateRole',async()=>1);
  t.mock.method(require('../src/modules/auth/refreshToken.repository'),'revokeAllForUser',async()=>1);
  for(const id of ['1','9007199254740992','9007199254740993']) {
    await assert.rejects(service.updateUserRole(id,'TECHNICIAN',id),{statusCode:400});
    await assert.rejects(service.updateUserStatus(id,false,id),{statusCode:400});
  }
  assert.equal(status.mock.callCount(),0);assert.equal(role.mock.callCount(),0);
  await service.updateUserRole('9007199254740993','TECHNICIAN','9007199254740992');
  await service.updateUserStatus('9007199254740993',false,'9007199254740992');
  assert.equal(role.mock.callCount(),1);assert.equal(status.mock.callCount(),1);
});
