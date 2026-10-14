// Opt-in local MySQL race. Commits ONLY generated fixture rows, then deletes
// those exact rows in finally. Native pool/transactions and real row locks.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env'),quiet:true});
assert.notEqual(process.env.NODE_ENV,'production');
assert.ok(['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST));
process.env.NODE_ENV = 'test';
const pool = require('../src/config/database');
const service = require('../src/modules/tickets/ticket.service');
let ticketId, guard, stage = 'setup'; const users = [], run = randomUUID();
(async()=>{
  try {
    guard = await pool.getConnection();
    const [categories] = await guard.query('SELECT id FROM ticket_categories WHERE is_active=TRUE LIMIT 1');
    const [priorities] = await guard.query('SELECT id FROM ticket_priorities WHERE is_active=TRUE LIMIT 1');
    assert.ok(categories.length && priorities.length);
    const [indexes] = await guard.query('SHOW INDEX FROM ticket_assignments');
    assert.ok(indexes.some(row=>row.Key_name === 'idx_ticket_assignments_ticket_active' && row.Non_unique === 1));
    const [tables] = await guard.query("SHOW TABLE STATUS LIKE 'tickets'"); assert.equal(tables[0].Engine,'InnoDB');
    console.log('Schema: nonunique active-assignment lookup index; uniqueness relies on service checks and InnoDB ticket row locks.');
    const hash = await require('../src/utils/password').hashPassword(randomUUID());
    for(const role of ['EMPLOYEE','TECHNICIAN','TECHNICIAN','ADMIN']) {
      const email = `race-${run}-${users.length}@example.test`;
      const [row] = await guard.execute("INSERT INTO users(first_name,last_name,email,password_hash,role,is_active,must_change_password) VALUES('Race','Fixture',?,?,?,TRUE,FALSE)",[email,hash,role]);
      users.push({id:String(row.insertId),role,email});
    }
    const [row] = await guard.execute("INSERT INTO tickets(ticket_number,created_by,category_id,priority_id,title,description,status) VALUES(?,?,?,?,?,?,'OPEN')",['RACE-'+run.slice(0,20),users[0].id,categories[0].id,priorities[0].id,'Controlled assignment race','Owned disposable local fixture']); ticketId = String(row.insertId);
    async function race(first,second) {
      await guard.beginTransaction(); await guard.execute('SELECT id FROM tickets WHERE id=? FOR UPDATE',[ticketId]);
      const original = pool.getConnection.bind(pool), ids = new Set(); let ready;
      const acquired = new Promise(resolve => {ready = resolve;});
      pool.getConnection = async () => {
        const connection = await original(); const [rows] = await connection.query('SELECT CONNECTION_ID() AS id'); ids.add(rows[0].id);
        if(ids.size === 2) ready(); return connection;
      };
      const results = Promise.allSettled([first(),second()]);
      let timer;
      let acquisitionError;
      try { await Promise.race([acquired,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Race connection timeout')),5000);})]); }
      catch(error) { acquisitionError = error; }
      finally {clearTimeout(timer); pool.getConnection = original; await guard.commit();}
      const settled = await results; if(acquisitionError) throw acquisitionError; assert.equal(ids.size,2);
      assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);
      const rejected = settled.find(r=>r.status==='rejected'); assert.equal(rejected.reason.statusCode,409);
    }
    stage = 'two-technician self-claim race';
    await race(()=>service.selfAssignTicket(ticketId,users[1]),()=>service.selfAssignTicket(ticketId,users[2]));
    const [assignments] = await guard.execute('SELECT * FROM ticket_assignments WHERE ticket_id=?',[ticketId]);
    assert.equal(assignments.length,1); assert.equal(assignments[0].unassigned_at,null);
    const [tickets] = await guard.execute('SELECT assigned_to,status FROM tickets WHERE id=?',[ticketId]);
    assert.equal(String(tickets[0].assigned_to),String(assignments[0].technician_id)); assert.equal(tickets[0].status,'ASSIGNED');
    const [history] = await guard.execute('SELECT id FROM ticket_status_history WHERE ticket_id=?',[ticketId]); assert.equal(history.length,1);
    const [notifications] = await guard.execute('SELECT id FROM notifications WHERE ticket_id=?',[ticketId]); assert.equal(notifications.length,1);
    stage = 'reassign versus unassign same-ID race';
    const other = users.find(u=>u.role==='TECHNICIAN' && u.id !== String(tickets[0].assigned_to));
    const expected = assignments[0].id;
    await race(()=>service.assignTicketByAdmin(ticketId,other.id,users[3],undefined,expected),()=>service.unassignTicketByAdmin(ticketId,expected,users[3]));
    const [final] = await guard.execute('SELECT assigned_to,status FROM tickets WHERE id=?',[ticketId]);
    const [active] = await guard.execute('SELECT * FROM ticket_assignments WHERE ticket_id=? AND unassigned_at IS NULL',[ticketId]);
    assert.equal(active.length,final[0].assigned_to === null ? 0 : 1);
    assert.equal(final[0].status,active.length ? 'ASSIGNED' : 'OPEN');
    if(active.length) assert.equal(String(active[0].technician_id),String(final[0].assigned_to));
    console.log('Native MySQL races PASS: two technicians; reassign versus unassign. Two distinct connections, one success/one 409 each.');
  } catch(error) { console.error(JSON.stringify({stage,name:error.name,code:error.code})); process.exitCode=1; }
  finally {
    if(guard) {
      await guard.rollback();
      if(ticketId) await guard.execute('DELETE FROM tickets WHERE id=? AND created_by=?',[ticketId,users[0].id]);
      for(const user of users) await guard.execute('DELETE FROM users WHERE id=? AND email=?',[user.id,user.email]);
      for(const user of users) { const [rows] = await guard.execute('SELECT COUNT(*) AS total FROM users WHERE id=?',[user.id]); assert.equal(Number(rows[0].total),0); }
      if(ticketId) for(const table of ['tickets','ticket_assignments','ticket_status_history','notifications']) {
        const [rows] = await guard.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE ${table === 'tickets' ? 'id' : 'ticket_id'}=?`,[ticketId]); assert.equal(Number(rows[0].total),0);
      }
      console.log('All generated race users, ticket, assignments, status history and notifications removed.');
      guard.release();
    }
    await pool.end();
  }
})();
