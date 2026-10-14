// Explicit local HTTP/MySQL regression; fixture changes roll back. No providers.
const assert = require('node:assert/strict');
let fixture, stage = 'setup', checks = 0;
(async () => {
  try {
    fixture = await require('./helpers/lifecycleWorkflowFixture')();
    const [employee,,a,admin,b] = fixture.users;
    const api = fixture.request, db = fixture.connection;
    const ticket = await fixture.create('assignment consistency'), route = '/tickets/' + ticket.id;
    const detail = async () => (await api(admin,'GET',route)).data.ticket;
    async function snapshot(id = ticket.id) {
      const result = {};
      for (const table of ['tickets','ticket_assignments','ticket_status_history','notifications']) {
        const [rows] = await db.execute(`SELECT * FROM ${table} WHERE ${table === 'tickets' ? 'id' : 'ticket_id'}=? ORDER BY id`,[id]); result[table] = rows;
      }
      const [rows] = await db.execute("SELECT * FROM audit_logs WHERE entity_type='TICKET' AND entity_id=? ORDER BY id",[id]); result.audit_logs = rows;
      return result;
    }
    async function reject(actor,method,path,body,status) {
      stage = 'rejection ' + path;
      const before = await snapshot(); await api(actor,method,path,body,status); assert.deepEqual(await snapshot(),before); checks++;
    }
    const workloads = async () => new Map((await api(admin,'GET','/users/technician-workload')).data.technicians.map(t => [String(t.id),t.workload.totalActive]));
    const baseline = await workloads();
    const initialNotifications = (await snapshot()).notifications.length;
    async function views(owner,deltaA,deltaB) {
      stage = 'lists, details and workload';
      const queue = (await api(admin,'GET','/tickets/queue?assignment=unassigned&limit=100&search='+encodeURIComponent(ticket.title))).data.tickets;
      assert.equal(queue.some(t => String(t.id) === String(ticket.id)),owner === null);
      for (const technician of [a,b]) {
        const list = (await api(technician,'GET','/tickets/assigned-to-me?limit=100&search='+encodeURIComponent(ticket.title))).data.tickets;
        assert.equal(list.some(t => String(t.id) === String(ticket.id)),owner === technician);
      }
      const adminList = (await api(admin,'GET','/tickets/queue?limit=100&search='+encodeURIComponent(ticket.title))).data.tickets;
      assert.equal(adminList.length,1); assert.equal(String(adminList[0].assignedTo),String(owner?.id ?? null));
      const current = await detail(); assert.equal(String(current.assignedTo),String(owner?.id ?? null));
      assert.equal(current.status,owner ? 'ASSIGNED' : 'OPEN');
      const state = await snapshot(), active = state.ticket_assignments.filter(row => row.unassigned_at === null);
      assert.equal(active.length,owner ? 1 : 0); if(owner) assert.equal(String(active[0].technician_id),owner.id);
      const counts = await workloads(); assert.equal(counts.get(a.id),baseline.get(a.id)+deltaA); assert.equal(counts.get(b.id),baseline.get(b.id)+deltaB); checks++;
    }
    await views(null,0,0);
    stage = 'self assignment'; await api(a,'POST',route+'/self-assign',{}); await views(a,1,0);
    let state = await snapshot(); assert.equal(state.ticket_assignments.length,1); assert.equal(state.ticket_assignments[0].assignment_type,'SELF'); assert.equal(String(state.ticket_assignments[0].assigned_by),a.id); checks++;
    await reject(a,'POST',route+'/self-assign',{},409); await reject(b,'POST',route+'/self-assign',{},409);
    const selfId = (await detail()).assignment.id;
    await api(admin,'PATCH',route+'/unassign',{expectedAssignmentId:selfId}); await views(null,0,0);
    await reject(admin,'PATCH',route+'/unassign',{expectedAssignmentId:selfId},409);
    stage = 'admin assignment'; await api(admin,'PATCH',route+'/assign',{technicianId:a.id,expectedAssignmentId:null}); await views(a,1,0);
    const firstId = (await detail()).assignment.id;
    stage = 'current-ID reassignment'; await api(admin,'PATCH',route+'/assign',{technicianId:b.id,expectedAssignmentId:firstId}); await views(b,0,1);
    const secondId = (await detail()).assignment.id;
    await reject(admin,'PATCH',route+'/assign',{technicianId:a.id,expectedAssignmentId:firstId},409);
    await reject(admin,'PATCH',route+'/assign',{technicianId:b.id,expectedAssignmentId:firstId},409);
    await reject(admin,'PATCH',route+'/assign',{technicianId:a.id},409);
    await reject(admin,'PATCH',route+'/assign',{technicianId:a.id,expectedAssignmentId:null},409);
    await reject(admin,'PATCH',route+'/unassign',{expectedAssignmentId:firstId},409);
    stage = 'current-ID no-op'; const before = await snapshot(); await api(admin,'PATCH',route+'/assign',{technicianId:b.id,expectedAssignmentId:secondId}); assert.deepEqual(await snapshot(),before); checks++;
    stage = 'current-ID unassignment'; await api(admin,'PATCH',route+'/unassign',{expectedAssignmentId:secondId}); await views(null,0,0);
    await reject(admin,'PATCH',route+'/assign',{technicianId:a.id,expectedAssignmentId:secondId},409);
    await reject(admin,'PATCH',route+'/unassign',{expectedAssignmentId:secondId},409);
    for(const actor of [employee,a,b]) {
      await reject(actor,'PATCH',route+'/assign',{technicianId:b.id,expectedAssignmentId:null},403);
      await reject(actor,'PATCH',route+'/unassign',{expectedAssignmentId:secondId},403);
    }
    await reject(employee,'POST',route+'/self-assign',{},403);
    await reject(a,'POST',route+'/self-assign',{technicianId:b.id},422);
    for(const value of [0,-1,true,1.5,'bad','18446744073709551616']) await reject(admin,'PATCH',route+'/assign',{technicianId:a.id,expectedAssignmentId:value},422);
    stage = 'assignment history'; state = await snapshot();
    assert.equal(state.ticket_assignments.length,3);
    assert.deepEqual(state.ticket_assignments.map(r => [String(r.technician_id),String(r.assigned_by),r.assignment_type,r.unassigned_at !== null]),[[a.id,a.id,'SELF',true],[a.id,admin.id,'ADMIN',true],[b.id,admin.id,'ADMIN',true]]);
    stage = 'status history'; assert.deepEqual(state.ticket_status_history.map(r => [r.from_status,r.to_status,String(r.changed_by)]),[['OPEN','ASSIGNED',a.id],['ASSIGNED','OPEN',admin.id],['OPEN','ASSIGNED',admin.id],['ASSIGNED','OPEN',admin.id]]);
    stage = 'notifications'; assert.deepEqual(state.notifications.slice(initialNotifications).map(r => [r.type,String(r.user_id)]),[['TICKET_ASSIGNED',a.id],['TICKET_UNASSIGNED',a.id],['TICKET_ASSIGNED',a.id],['TICKET_REASSIGNED',b.id],['TICKET_REASSIGNED',a.id],['TICKET_UNASSIGNED',b.id]]);
    stage = 'audits'; assert.deepEqual(state.audit_logs.map(r => [r.action,String(r.actor_user_id)]),[['TICKET_UNASSIGNED',admin.id],['TICKET_ASSIGNED',admin.id],['TICKET_REASSIGNED',admin.id],['TICKET_UNASSIGNED',admin.id]]); checks++;
    stage = 'reassignment rollback after old history closes';
    await api(admin,'PATCH',route+'/assign',{technicianId:a.id});
    const beforeFailure = await snapshot(), expected = (await detail()).assignment.id;
    const notificationService = require('../src/modules/notifications/notification.service');
    const original = notificationService.createNotification;
    notificationService.createNotification = async () => { throw new Error('Controlled assignment notification failure'); };
    try { await api(admin,'PATCH',route+'/assign',{technicianId:b.id,expectedAssignmentId:expected},500); }
    finally { notificationService.createNotification = original; }
    assert.deepEqual(await snapshot(),beforeFailure); checks++;
    for(const status of ['ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','REOPENED']) {
      stage = 'reassignment preserves ' + status;
      const stateTicket = fixture.states[status], stateRoute = '/tickets/'+stateTicket.id;
      const current = (await api(admin,'GET',stateRoute)).data.ticket;
      await api(admin,'PATCH',stateRoute+'/assign',{technicianId:b.id,expectedAssignmentId:current.assignment.id});
      const after = await snapshot(stateTicket.id);
      assert.equal(after.tickets[0].status,status); assert.equal(String(after.tickets[0].assigned_to),b.id);
      assert.equal(after.ticket_assignments.filter(r=>r.unassigned_at===null).length,1); checks++;
    }
    for(const status of ['RESOLVED','CLOSED']) {
      stage = 'terminal assignment rejection ' + status;
      const stateTicket = fixture.states[status], stateRoute = '/tickets/'+stateTicket.id;
      const current = (await api(admin,'GET',stateRoute)).data.ticket, before = await snapshot(stateTicket.id);
      await api(admin,'PATCH',stateRoute+'/assign',{technicianId:b.id,expectedAssignmentId:current.assignment.id},409);
      await api(admin,'PATCH',stateRoute+'/unassign',{expectedAssignmentId:current.assignment.id},409);
      assert.deepEqual(await snapshot(stateTicket.id),before); checks++;
    }
    console.log(`Assignment consistency: ${checks} checks passed (real HTTP/MySQL; rollback isolated).`);
  } catch(error) {
    console.error(JSON.stringify({stage,name:error.name,code:error.code,actual:typeof error.actual === 'number' ? error.actual : undefined,expected:typeof error.expected === 'number' ? error.expected : undefined})); process.exitCode = 1;
  } finally { if(fixture) await fixture.cleanup(); }
})();
