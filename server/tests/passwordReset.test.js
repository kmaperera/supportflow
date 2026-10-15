const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
Object.assign(process.env, { NODE_ENV: 'test', CLIENT_URL: 'http://localhost:5173', JWT_ACCESS_SECRET: randomBytes(40).toString('hex'),
  PASSWORD_RESET_TTL_MINUTES: '15',
  JWT_REFRESH_SECRET: randomBytes(40).toString('hex'), JWT_ACCESS_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d',
  CLOUDINARY_CLOUD_NAME: 'fixture', CLOUDINARY_API_KEY: 'fixture', CLOUDINARY_API_SECRET: 'fixture' });

test('password recovery HTTP contracts, opaque tokens, rollback and privacy', async t => {
  const password = 'RecoveryFixture123!', newPassword = 'ChangedFixture456!';
  const passwords = require('../src/utils/password');
  const users = [1,2,3,4].map((id,i)=>({ id, email: `recovery-${id}@example.test`, first_name: '<script>Fixture</script>', role: ['EMPLOYEE','TECHNICIAN','ADMIN','EMPLOYEE'][i], is_active: id!==4, must_change_password: 1 }));
  const initialHash = await passwords.hashPassword(password); users.forEach(u=>{u.password_hash=initialHash});users[2].must_change_password=0;
  const records=[], mails=[], events=[];let failMail=false,failRevoke=false,revoked=0,sequence=0,saved,deliveryGate;
  const connection={async beginTransaction(){saved={users:structuredClone(users),records:structuredClone(records),revoked,events:structuredClone(events)}},async commit(){},async rollback(){users.splice(0,users.length,...saved.users);records.splice(0,records.length,...saved.records);revoked=saved.revoked;events.splice(0,events.length,...saved.events)},release(){}};
  t.mock.method(require('../src/config/database'),'getConnection',async()=>connection);
  const userRepo=require('../src/modules/users/user.repository');
  t.mock.method(userRepo,'findByEmail',async email=>users.find(u=>u.email===email)||null);
  t.mock.method(userRepo,'findById',async id=>users.find(u=>String(u.id)===String(id))||null);
  t.mock.method(userRepo,'updateLastLogin',async()=>{});
  t.mock.method(userRepo,'updatePassword',async(id,hash,db)=>{assert.equal(db,connection);const u=users.find(u=>String(u.id)===String(id));u.password_hash=hash;u.must_change_password=0;return 1});
  const repo=require('../src/modules/auth/passwordReset.repository');
  t.mock.method(repo,'lockUser',async id=>users.find(u=>String(u.id)===String(id))||null);
  t.mock.method(repo,'invalidateForUser',async id=>records.filter(r=>String(r.user_id)===String(id)).forEach(r=>{r.used=true}));
  t.mock.method(repo,'create',async(userId,hash,minutes)=>{assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(minutes,15);const id=++sequence;records.push({id,user_id:userId,hash,expires:Date.now()+minutes*60000,used:false});return id});
  t.mock.method(repo,'findUsable',async hash=>records.find(r=>r.hash===hash&&!r.used&&r.expires>Date.now())||null);
  t.mock.method(repo,'invalidateById',async id=>{records.find(r=>r.id===id).used=true});
  t.mock.method(require('../src/modules/auth/refreshToken.repository'),'revokeAllForUser',async()=>{if(failRevoke)throw Error('Private database fault');revoked++;return 2});
  t.mock.method(require('../src/modules/audit/audit.repository'),'create',async entry=>{events.push(entry);return events.length});
  t.mock.method(require('../src/services/email.service'),'sendEmail',async data=>{if(deliveryGate)await deliveryGate;if(failMail)throw Error('Private SMTP credentials');mails.push(data)});
  const service=require('../src/modules/auth/passwordReset.service');
  const server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await service.drainPendingRequests();server.closeAllConnections();await new Promise(r=>server.close(r))});
  const origin=`http://127.0.0.1:${server.address().port}/api/v1`;
  const access=require('../src/utils/jwt').generateAccessToken(users[2]);
  const request=async(path,body,status=200,token)=>{const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});assert.equal(r.status,status);const d=await r.json();assert.equal(d.success,status<400);if(status>=400)assert.ok(Array.isArray(d.errors));return d};
  const raw=()=>new URL(mails.at(-1).text.match(/http[^\s]+/)[0]).searchParams.get('token');
  await t.test('public response waits for email completion within the request',async()=>{
    let release;deliveryGate=new Promise(resolve=>{release=resolve});
    let responded=false;
    const response=require('../src/modules/auth/passwordReset.controller').forgotPassword({body:{email:users[1].email},ip:'127.0.0.1'}, {status(){return this},json(){responded=true}}, error=>{throw error});
    try {
      await new Promise(resolve=>setTimeout(resolve,100));
      assert.equal(responded,false);
    } finally {release();}
    await response;deliveryGate=undefined;
    assert.ok(mails.length>0);
    records.length=0;mails.length=0;events.length=0;
  });
  await t.test('existing, missing and inactive public requests are indistinguishable',async()=>{
    const responses=[];for(const email of [users[0].email,'missing@example.test',users[3].email]){responses.push(await request('/auth/forgot-password',{email}));await service.drainPendingRequests()}
    assert.deepEqual(responses[0],responses[1]);assert.deepEqual(responses[1],responses[2]);assert.equal(mails.length,1);assert.equal(records.length,1);assert.equal(revoked,0);
    assert.match(raw(),/^[a-f0-9]{64}$/);assert.equal(records[0].hash,createHash('sha256').update(raw()).digest('hex'));assert.ok(!JSON.stringify(records).includes(raw()));assert.ok(mails[0].html.includes('&lt;script&gt;'));assert.ok(!mails[0].html.includes('<script>'));assert.equal(new URL(mails[0].text.match(/http[^\s]+/)[0]).origin,process.env.CLIENT_URL);
    await request('/auth/forgot-password',{email:users[0].email},429);
  });
  await t.test('Admin reset protects roles, inactive targets, IDs and extra fields',async()=>{
    await request('/users/2/reset-password',{},401);await request('/users/2/reset-password',{},403,require('../src/utils/jwt').generateAccessToken(users[0]));
    await request('/users/0/reset-password',{},422,access);await request('/users/2/reset-password',{password:'forbidden'},422,access);await request('/users/4/reset-password',{},400,access);await request('/users/999/reset-password',{},404,access);
    await request('/users/2/reset-password',{},200,access);assert.equal(revoked,0);
  });
  await t.test('newest request invalidates older token; invalid input does not consume it',async()=>{
    const old=raw();await service.sendInstructions(2,{actorUserId:3},true);const token=raw();assert.notEqual(old,token);
    await request('/auth/reset-password',{token:old,newPassword,confirmPassword:newPassword},400);
    await request('/auth/reset-password',{token,newPassword:'short',confirmPassword:'short'},422);
    await request('/auth/reset-password',{token,newPassword,confirmPassword:'Mismatch123!'},422);
    assert.ok(await repo.findUsable(createHash('sha256').update(token).digest('hex')));
    await request('/auth/reset-password',{token:token.slice(0,-1)+(token.at(-1)==='a'?'b':'a'),newPassword,confirmPassword:newPassword},400);
  });
  await t.test('expired/inactive tokens fail; SMTP failures leave no usable token',async()=>{
    records.at(-1).expires=Date.now()-1000;await request('/auth/reset-password',{token:raw(),newPassword,confirmPassword:newPassword},400);
    await service.sendInstructions(2,{actorUserId:3},true);users[1].is_active=false;await request('/auth/reset-password',{token:raw(),newPassword,confirmPassword:newPassword},400);users[1].is_active=true;
    failMail=true;await assert.rejects(service.sendInstructions(2,{actorUserId:3},true),{statusCode:502});assert.ok(records.filter(r=>r.user_id===2).every(r=>r.used));failMail=false;
  });
  await t.test('public SMTP failure stays generic, invalidates delivery token and logs no credentials',async()=>{
    const messages=[];const diagnostic=t.mock.method(console,'error',(...args)=>messages.push(args));
    failMail=true;let status,body;await require('../src/modules/auth/passwordReset.controller').forgotPassword({body:{email:users[0].email},ip:'127.0.0.1'}, {status(value){status=value;return this},json(value){body=value}});
    assert.equal(status,200);assert.deepEqual(body,{success:true,message:service.GENERIC_MESSAGE});await service.drainPendingRequests();assert.ok(records.filter(r=>r.user_id===1).every(r=>r.used));assert.deepEqual(messages,[['Password reset request delivery failed',{stage:'token_or_delivery'}]]);failMail=false;diagnostic.mock.restore();
  });
  await t.test('revocation failure rolls back password/token/audit; successful reset is single-use',async()=>{
    await service.sendInstructions(2,{actorUserId:3},true);const token=raw();failRevoke=true;await assert.rejects(service.resetPassword(token,newPassword),/Private database fault/);assert.equal(users[1].password_hash,initialHash);assert.ok(await repo.findUsable(createHash('sha256').update(token).digest('hex')));failRevoke=false;
    await request('/auth/reset-password',{token,newPassword,confirmPassword:newPassword});assert.equal(users[1].must_change_password,0);assert.equal(revoked,1);assert.ok(await passwords.comparePassword(newPassword,users[1].password_hash));assert.ok(!(await passwords.comparePassword(password,users[1].password_hash)));
    await assert.rejects(service.resetPassword(token,newPassword),{statusCode:400});await assert.rejects(require('../src/modules/auth/auth.service').login(users[1].email,password),{statusCode:401});assert.equal((await require('../src/modules/auth/auth.service').login(users[1].email,newPassword)).mustChangePassword,false);
    for(const event of events){const value=JSON.stringify(event);for(const secret of [token,newPassword,password,initialHash])assert.ok(!value.includes(secret))}
    assert.ok(events.some(e=>e.action==='PASSWORD_RESET_COMPLETED'));assert.ok(events.some(e=>e.action==='ADMIN_PASSWORD_RESET_REQUESTED'));
  });
  await t.test('recovery lifetime is short and reset limiter is independent',async()=>{
    const lifetime=require('../src/config/passwordReset').resetLifetime;assert.equal(lifetime({}),15);assert.equal(lifetime({PASSWORD_RESET_TTL_MINUTES:'30'}),30);for(const value of ['0','31','1.5','NaN'])assert.throws(()=>lifetime({PASSWORD_RESET_TTL_MINUTES:value}));
    for(let i=0;i<3;i++)await request('/auth/reset-password',{token:'0'.repeat(64),newPassword,confirmPassword:newPassword},400);
    await request('/auth/reset-password',{token:'0'.repeat(64),newPassword,confirmPassword:newPassword},429);
  });
  await t.test('Admin self and other Admin targets use the same safe email flow',async()=>{
    users.push({...users[2],id:5,email:'other-admin@example.test'});const before=revoked;
    await request('/users/3/reset-password',{},200,access);await request('/users/5/reset-password',{},200,access);
    assert.equal(revoked,before);assert.equal(mails.at(-1).to,'other-admin@example.test');
    assert.ok(records.some(r=>r.user_id===3&&!r.used));assert.ok(records.some(r=>r.user_id===5&&!r.used));
  });
});
