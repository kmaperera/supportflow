const {test} = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const tickets = require('../src/modules/tickets/ticket.repository');
const assignments = require('../src/modules/tickets/ticketAssignment.repository');
const users = require('../src/modules/users/user.repository');
const service = require('../src/modules/tickets/ticket.service');

test('reassignment compares the locked assignment ID before no-op or writes, including ABA and BIGINT identities', async t => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async rollback() { events.push('rollback'); },
    async commit() { events.push('commit'); }, release() { events.push('release'); },
  };
  t.mock.method(pool,'getConnection',async()=>connection);
  t.mock.method(tickets,'lockById',async()=>{events.push('lock');return {id:5};});
  t.mock.method(tickets,'findById',async()=>({id:5,assigned_to:7,status:'ASSIGNED'}));
  // Technician A was removed then assigned again: identity alone is insufficient.
  t.mock.method(assignments,'findActiveAssignmentsByTicketId',async(id,db)=>{
    assert.equal(db,connection); assert.ok(events.includes('lock'));
    return [{id:'9007199254740993',technician_id:7}];
  });
  const lookup = t.mock.method(users,'findById',async()=>({id:7,role:'TECHNICIAN',is_active:true}));
  const write = t.mock.method(assignments,'closeActiveAssignment',async()=>{throw new Error('Unexpected assignment write');});
  for(const target of [7,8]) {
    for(const expected of [undefined,null,11,'9007199254740992']) {
      events.length=0;
      await assert.rejects(service.assignTicketByAdmin(5,target,{id:1,role:'ADMIN'},undefined,expected),{
        statusCode:409,message:'Ticket assignment has changed. Refresh and try again.',
      });
      assert.deepEqual(events,['begin','lock','rollback','release']);
    }
  }
  for(const expected of [0,-1,true,1.5,'bad',9007199254740992,'18446744073709551616']) {
    await assert.rejects(service.assignTicketByAdmin(5,8,{id:1,role:'ADMIN'},undefined,expected),{statusCode:422});
  }
  assert.equal(lookup.mock.callCount(),0); assert.equal(write.mock.callCount(),0);
  events.length=0;
  const result = await service.assignTicketByAdmin(5,7,{id:1,role:'ADMIN'},undefined,'9007199254740993');
  assert.equal(result.assignedTo,7); assert.deepEqual(events,['begin','lock','commit','release']);
  assert.equal(write.mock.callCount(),0);
});
