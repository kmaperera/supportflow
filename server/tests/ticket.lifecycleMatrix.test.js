const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TICKET_STATUSES } = require('../src/constants/ticketStatuses');
const rules = require('../src/utils/ticketStatus');
const statuses = ['OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','REOPENED','CLOSED'];
// Independent expected contract, including the intentional waiting-resolution path.
const edges = new Set(['OPEN:ASSIGNED','ASSIGNED:IN_PROGRESS','IN_PROGRESS:WAITING_FOR_USER',
  'WAITING_FOR_USER:IN_PROGRESS','IN_PROGRESS:RESOLVED','WAITING_FOR_USER:RESOLVED',
  'RESOLVED:CLOSED','RESOLVED:REOPENED','REOPENED:IN_PROGRESS']);
test('persisted/API status vocabulary has exactly the established seven states', () => {
  assert.deepEqual(Object.values(TICKET_STATUSES).sort(), [...statuses].sort());
});
for (const from of statuses) for (const to of statuses) test(`lifecycle matrix ${from} -> ${to}`, () => {
  const allowed = edges.has(`${from}:${to}`);
  assert.equal(rules.canTransitionTicketStatus(from,to), allowed);
  if (allowed) assert.equal(rules.assertTicketStatusTransition(from,to), true);
  else assert.throws(() => rules.assertTicketStatusTransition(from,to), { statusCode:409 });
});
for (const target of [null,'','in_progress','In_Progress','IN PROGRESS','WAITING','ESCALATED']) {
  test(`invalid lifecycle target ${String(target)}`, () => {
    assert.equal(rules.isValidTicketStatus(target),false);
    assert.throws(() => rules.assertTicketStatusTransition('IN_PROGRESS',target), { statusCode:400 });
  });
}

// A small lock model exercises the actual service's lock-before-read behavior.
// It is deliberately not presented as multi-connection MySQL certification.
for (const first of ['close','reopen']) test(`competing Employee ${first} and Admin alternative serialize`, async t => {
  const pool=require('../src/config/database'), repository=require('../src/modules/tickets/ticket.repository');
  const history=require('../src/modules/tickets/ticketStatusHistory.repository');
  const notifications=require('../src/modules/notifications/notification.service');
  const realtime=require('../src/modules/notifications/notificationRealtime.service');
  const service=require('../src/modules/tickets/ticket.service');
  let chain=Promise.resolve();const rows=[],notices=[];
  const ticket={id:5,created_by:3,assigned_to:7,status:'RESOLVED',ticket_number:'SUP-LIFECYCLE'};
  t.mock.method(pool,'getConnection',async()=>{
    let unlock;
    return {beginTransaction:async()=>{},commit:async()=>unlock(),rollback:async()=>unlock?.(),release(){},
      async acquire(){const previous=chain;chain=new Promise(resolve=>{unlock=resolve});await previous;}};
  });
  t.mock.method(repository,'lockById',async(id,db)=>{await db.acquire();return {id};});
  t.mock.method(repository,'findById',async()=>({...ticket}));
  t.mock.method(repository,'closeTicket',async()=>{ticket.status='CLOSED';return 1;});
  t.mock.method(repository,'reopenTicket',async()=>{ticket.status='REOPENED';return 1;});
  t.mock.method(history,'createHistory',async row=>{rows.push(row);});
  t.mock.method(notifications,'createNotification',async row=>{notices.push(row);return row;});
  t.mock.method(realtime,'emitNotifications',()=>true);
  const employee={id:3,role:'EMPLOYEE'},admin={id:1,role:'ADMIN'};
  const methods=first==='close'?['closeTicket','reopenTicket']:['reopenTicket','closeTicket'];
  const results=await Promise.allSettled([service[methods[0]](5,employee),service[methods[1]](5,admin)]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
  assert.equal(results[1].reason.statusCode,409);
  assert.equal(ticket.status,first==='close'?'CLOSED':'REOPENED');
  assert.equal(rows.length,1);assert.equal(rows[0].changedBy,3);assert.equal(notices.length,1);
});
