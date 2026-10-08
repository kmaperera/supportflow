const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const http=require('node:http');
process.env.JWT_ACCESS_SECRET=randomBytes(32).toString('hex');process.env.JWT_ACCESS_EXPIRES_IN='15m';process.env.NODE_ENV='test';

test('real sockets cannot choose or join another users notification room',async t=>{
  const actors=['EMPLOYEE','EMPLOYEE','TECHNICIAN','TECHNICIAN','ADMIN'].map((role,i)=>({id:i+1,role,is_active:1}));
  t.mock.method(require('../src/modules/users/user.repository'),'findById',async id=>actors.find(u=>String(u.id)===id)||null);
  const server=http.createServer();
  const io=require('../src/config/socket').initializeSocket(server);
  io.on('connection',socket=>socket.on('fixture:barrier',ack=>ack()));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const clients=[];
  t.after(async()=>{for(const client of clients)client.disconnect();await new Promise(r=>io.close(r));});
  const connect=require('socket.io-client').io;
  const tokens=require('../src/utils/jwt');
  for(const actor of actors){
    const client=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],reconnection:false,
      auth:{token:tokens.generateAccessToken({...actor,role:'ADMIN'}),userId:999,room:'user:999',role:'ADMIN'}});
    clients.push(client);await once(client,'connect',{signal:AbortSignal.timeout(5000)});
    for(const event of ['join','joinRoom','join:user','subscribe'])client.emit(event,`user:${actor.id===1?2:1}`);
    await client.timeout(2000).emitWithAck('fixture:barrier');
    const socket=io.sockets.sockets.get(client.id);
    assert.deepEqual([...socket.rooms].sort(),[client.id,`user:${actor.id}`].sort());
    assert.equal(socket.user.role,actor.role);
  }
  const received=clients.map(()=>[]);
  clients.forEach((c,i)=>c.on('notification:new',value=>received[i].push(value)));
  const waits=clients.map(c=>once(c,'notification:new',{signal:AbortSignal.timeout(5000)}));
  const emit=require('../src/modules/notifications/notificationRealtime.service').emitNotification;
  for(const actor of actors)assert.equal(emit({id:100+actor.id,userId:actor.id,ticketId:null,commentId:null,type:'TICKET_CREATED',title:'Fixture',message:'Private recipient fixture',isRead:false,readAt:null,createdAt:new Date()}),true);
  await Promise.all(waits);
  await Promise.all(clients.map(c=>c.timeout(2000).emitWithAck('fixture:barrier')));
  for(let i=0;i<actors.length;i++)assert.deepEqual(received[i].map(n=>n.id),[101+i]);
});
