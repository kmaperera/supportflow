// Run explicitly against local MySQL. All rows/changes roll back; no provider traffic.
const assert=require('node:assert/strict');
let fixture,stage='setup',checks=0;
(async()=>{
  try{
    fixture=await require('./helpers/lifecycleWorkflowFixture')();
    const [employee,otherEmployee,technician,admin,wrongTechnician]=fixture.users;
    const api=fixture.request,db=fixture.connection;
    const snapshot=async id=>{
      const [tickets]=await db.execute('SELECT * FROM tickets WHERE id=?',[id]);
      const [history]=await db.execute('SELECT * FROM ticket_status_history WHERE ticket_id=? ORDER BY changed_at,id',[id]);
      const [notifications]=await db.execute('SELECT * FROM notifications WHERE ticket_id=? ORDER BY id',[id]);
      const [audits]=await db.execute("SELECT * FROM audit_logs WHERE entity_type='TICKET' AND entity_id=? ORDER BY id",[id]);
      const [assignments]=await db.execute('SELECT * FROM ticket_assignments WHERE ticket_id=? ORDER BY id',[id]);
      const [comments]=await db.execute('SELECT * FROM ticket_comments WHERE ticket_id=? ORDER BY id',[id]);
      const [attachments]=await db.execute('SELECT * FROM ticket_attachments WHERE ticket_id=? ORDER BY id',[id]);
      const [feedback]=await db.execute('SELECT * FROM ticket_feedback WHERE ticket_id=?',[id]);
      return {ticket:tickets[0],history,notifications,audits,assignments,comments,attachments,feedback};
    };
    async function isolated(label,body){stage=label;await db.query('SAVEPOINT lifecycle_case');try{await body();checks++;}finally{await db.query('ROLLBACK TO SAVEPOINT lifecycle_case');await db.query('RELEASE SAVEPOINT lifecycle_case');}}
    const actions={IN_PROGRESS:['status',{status:'IN_PROGRESS'}],WAITING_FOR_USER:['status',{status:'WAITING_FOR_USER'}],
      RESOLVED:['resolve',{resolutionSummary:'Valid lifecycle resolution & note.'}],REOPENED:['reopen',{}],CLOSED:['close',{}]};
    const edges=new Set(['ASSIGNED:IN_PROGRESS','IN_PROGRESS:WAITING_FOR_USER','WAITING_FOR_USER:IN_PROGRESS',
      'IN_PROGRESS:RESOLVED','WAITING_FOR_USER:RESOLVED','RESOLVED:REOPENED','RESOLVED:CLOSED','REOPENED:IN_PROGRESS']);
    const [schema]=await db.query("SHOW COLUMNS FROM tickets LIKE 'status'");
    assert.deepEqual(schema[0].Type.match(/'([^']+)'/g).map(value=>value.slice(1,-1)).sort(),Object.keys(fixture.states).sort());checks++;
    for(const [from,ticket] of Object.entries(fixture.states))for(const [to,[action,body]] of Object.entries(actions)){
      await isolated(`matrix ${from} -> ${to}`,async()=>{
        await db.execute("UPDATE tickets SET updated_at='2000-01-01 00:00:00' WHERE id=?",[ticket.id]);
        const before=await snapshot(ticket.id),allowed=edges.has(from+':'+to);
        const response=await api(admin,'PATCH',`/tickets/${ticket.id}/${action}`,body,allowed?200:409);
        const after=await snapshot(ticket.id);
        if(!allowed){assert.deepEqual(after,before);assert.ok(!/SQL syntax|mysql|stack trace|\bSELECT\b|\bUPDATE\s+\w+\s+SET\b/i.test(response.message));return;}
        assert.equal(response.data.ticket.status,to);assert.equal(after.ticket.status,to);
        assert.equal(after.history.length,before.history.length+1);
        const row=after.history.at(-1);assert.equal(row.from_status,from);assert.equal(row.to_status,to);assert.equal(String(row.changed_by),admin.id);assert.equal(String(row.ticket_id),String(ticket.id));assert.ok(row.changed_at instanceof Date);
        assert.ok(after.ticket.updated_at>before.ticket.updated_at);
        assert.equal(after.notifications.length,before.notifications.length+1);assert.deepEqual(after.audits,before.audits);
        const notice=after.notifications.at(-1);assert.equal(String(notice.user_id),['CLOSED','REOPENED'].includes(to)?technician.id:employee.id);
        assert.equal(notice.type,['CLOSED','REOPENED','RESOLVED'].includes(to)?'TICKET_'+to:'STATUS_CHANGED');
        assert.deepEqual(after.assignments,before.assignments);
        for(const key of ['response_due_at','resolution_due_at','sla_response_due_at','sla_resolution_due_at'])assert.deepEqual(after.ticket[key],before.ticket[key]);
        if(to==='RESOLVED'){assert.ok(after.ticket.resolved_at instanceof Date);assert.equal(after.ticket.resolution_summary,body.resolutionSummary);}
        if(to==='REOPENED'){assert.equal(after.ticket.resolved_at,null);assert.equal(after.ticket.resolution_summary,null);assert.equal(after.ticket.closed_at,null);assert.equal(after.ticket.assigned_to,before.ticket.assigned_to);}
        if(to==='CLOSED'){assert.ok(after.ticket.closed_at instanceof Date);assert.deepEqual(after.ticket.resolved_at,before.ticket.resolved_at);}
      });
    }
    for(const [from,ticket] of Object.entries(fixture.states))for(const [to,[action,body]] of Object.entries(actions)){
      const actor=['CLOSED','REOPENED'].includes(to)?employee:technician;
      await isolated(`own role ${from} -> ${to}`,async()=>{
        const before=await snapshot(ticket.id),allowed=edges.has(from+':'+to);
        await api(actor,'PATCH',`/tickets/${ticket.id}/${action}`,body,allowed?200:409);
        const after=await snapshot(ticket.id);if(!allowed)assert.deepEqual(after,before);else{assert.equal(after.history.length,before.history.length+1);assert.equal(String(after.history.at(-1).changed_by),actor.id);}
      });
    }
    for(const [actor,from,action,body,code] of [
      [employee,'ASSIGNED','status',{status:'IN_PROGRESS'},403],[employee,'IN_PROGRESS','resolve',{resolutionSummary:'Valid resolution note.'},403],
      [wrongTechnician,'ASSIGNED','status',{status:'IN_PROGRESS'},404],[wrongTechnician,'IN_PROGRESS','resolve',{resolutionSummary:'Valid resolution note.'},404],
      [technician,'RESOLVED','close',{},403],[technician,'RESOLVED','reopen',{},403],
      [otherEmployee,'RESOLVED','close',{},404],[otherEmployee,'RESOLVED','reopen',{},404],
    ])await isolated('role/ownership '+from+' '+action,async()=>{const ticket=fixture.states[from],before=await snapshot(ticket.id);await api(actor,'PATCH',`/tickets/${ticket.id}/${action}`,body,code);assert.deepEqual(await snapshot(ticket.id),before);});
    for(const body of [{},{resolutionSummary:''},{resolutionSummary:'   '}])await isolated('blank resolution',async()=>{
      const ticket=fixture.states.IN_PROGRESS,before=await snapshot(ticket.id);await api(technician,'PATCH',`/tickets/${ticket.id}/resolve`,body,422);assert.deepEqual(await snapshot(ticket.id),before);
    });
    for(const status of [null,'','in_progress','In_Progress','IN PROGRESS','WAITING','CLOSE','ESCALATED','OPEN','ASSIGNED','RESOLVED','REOPENED','CLOSED'])await isolated('invalid target vocabulary',async()=>{
      const ticket=fixture.states.IN_PROGRESS,before=await snapshot(ticket.id);await api(admin,'PATCH',`/tickets/${ticket.id}/status`,{status},422);assert.deepEqual(await snapshot(ticket.id),before);
    });
    for(const actor of [employee,technician,admin])await isolated('generic status bypass '+actor.role,async()=>{
      const ticket=fixture.states.OPEN,before=await snapshot(ticket.id);await api(actor,'PATCH','/tickets/'+ticket.id,{status:'RESOLVED'},actor===employee?422:403);assert.deepEqual(await snapshot(ticket.id),before);
    });
    for(const from of ['RESOLVED','CLOSED'])await isolated('assignment rejected '+from,async()=>{const ticket=fixture.states[from],before=await snapshot(ticket.id);await api(admin,'PATCH',`/tickets/${ticket.id}/assign`,{technicianId:wrongTechnician.id},409);assert.deepEqual(await snapshot(ticket.id),before);});
    await isolated('self-assignment lifecycle actor',async()=>{
      const ticket=fixture.states.OPEN,before=await snapshot(ticket.id);const assigned=(await api(technician,'POST',`/tickets/${ticket.id}/self-assign`,{})).data.ticket;const after=await snapshot(ticket.id);
      assert.equal(assigned.status,'ASSIGNED');assert.equal(String(assigned.assignedTo),technician.id);assert.equal(after.history.length,before.history.length+1);assert.equal(String(after.history.at(-1).changed_by),technician.id);assert.equal(after.assignments.length,1);assert.equal(after.assignments[0].assignment_type,'SELF');
    });
    for(const from of ['ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','REOPENED'])await isolated('unassign lifecycle side path '+from,async()=>{
      const ticket=fixture.states[from],before=await snapshot(ticket.id),detail=(await api(admin,'GET','/tickets/'+ticket.id)).data.ticket;
      const result=(await api(admin,'PATCH',`/tickets/${ticket.id}/unassign`,{expectedAssignmentId:detail.assignment.id})).data.ticket;const after=await snapshot(ticket.id);
      assert.equal(result.status,'OPEN');assert.equal(result.assignedTo,null);assert.equal(after.history.length,before.history.length+1);assert.equal(after.history.at(-1).to_status,'OPEN');assert.equal(String(after.history.at(-1).changed_by),admin.id);assert.ok(after.assignments[0].unassigned_at);assert.equal(after.audits.length,before.audits.length+1);
    });
    for(const from of Object.keys(fixture.states))await isolated('Employee edit '+from,async()=>{
      const ticket=fixture.states[from],allowed=['OPEN','ASSIGNED'].includes(from),before=await snapshot(ticket.id);
      await api(employee,'PATCH','/tickets/'+ticket.id,{title:'Lifecycle edited fixture'},allowed?200:409);
      const after=await snapshot(ticket.id);assert.equal(after.ticket.status,from);if(!allowed)assert.deepEqual(after,before);
    });
    stage='creation/assignment linkage';let live=await fixture.create('complete journey');const id=String(live.id),route='/tickets/'+id;
    let before=await snapshot(id);assert.equal(live.status,'OPEN');assert.equal(live.assignedTo,null);assert.ok(before.ticket.created_at instanceof Date);assert.equal(before.history.length,0);assert.equal(live.resolvedAt,null);assert.equal(live.closedAt,null);
    live=(await api(admin,'PATCH',route+'/assign',{technicianId:technician.id})).data.ticket;
    let after=await snapshot(id);assert.equal(live.status,'ASSIGNED');assert.equal(after.assignments.length,1);assert.equal(after.history.length,1);assert.equal(String(after.history[0].changed_by),admin.id);assert.equal(after.history[0].from_status,'OPEN');checks++;
    stage='working loops/first response';for(const status of ['IN_PROGRESS','WAITING_FOR_USER','IN_PROGRESS','WAITING_FOR_USER','IN_PROGRESS'])live=(await api(technician,'PATCH',route+'/status',{status})).data.ticket;
    after=await snapshot(id);assert.equal(after.history.length,6);assert.ok(live.firstResponseAt);const firstResponse=live.firstResponseAt;const deadlines=[live.responseDueAt,live.resolutionDueAt];checks++;
    stage='non-lifecycle actions';const statusBefore=live.status;
    await api(technician,'POST',route+'/comments',{content:'Lifecycle public response & text.'},201);await api(technician,'POST',route+'/internal-notes',{content:'Lifecycle private note.'},201);
    const upload=new FormData();upload.append('attachment',new Blob(['Lifecycle attachment bytes'],{type:'text/plain'}),'lifecycle.txt');
    const uploaded=await fetch('http://localhost:5099/api/v1'+route+'/attachments',{method:'POST',headers:{Authorization:'Bearer '+technician.token},body:upload});assert.equal(uploaded.status,201);await uploaded.arrayBuffer();
    assert.equal((await api(technician,'GET',route)).data.ticket.status,statusBefore);assert.equal((await snapshot(id)).history.length,6);
    assert.ok(fixture.priorities.length>1,'Two active seeded priority/SLA policies are required');await api(technician,'PATCH',route+'/priority',{priorityId:String(fixture.priorities[1].id)});assert.equal((await api(technician,'GET',route)).data.ticket.status,statusBefore);checks++;
    stage='resolve/reopen/re-resolve/close';live=(await api(technician,'PATCH',route+'/resolve',{resolutionSummary:'First complete lifecycle resolution.'})).data.ticket;const resolvedTime=live.resolvedAt;
    await api(employee,'PUT',route+'/feedback',{rating:5,comment:'Resolved lifecycle feedback.'},409);
    await api(technician,'POST',route+'/internal-notes',{content:'Staff follow-up before closing.'},201);
    live=(await api(employee,'PATCH',route+'/reopen',{})).data.ticket;assert.equal(String(live.assignedTo),technician.id);assert.equal(live.resolvedAt,null);assert.equal(live.resolutionSummary,null);assert.deepEqual(live.firstResponseAt,firstResponse);
    live=(await api(technician,'PATCH',route+'/status',{status:'IN_PROGRESS'})).data.ticket;
    live=(await api(technician,'PATCH',route+'/resolve',{resolutionSummary:'Second complete lifecycle resolution.'})).data.ticket;assert.ok(Date.parse(live.resolvedAt)>=Date.parse(resolvedTime));assert.equal(live.resolutionSummary,'Second complete lifecycle resolution.');
    live=(await api(employee,'PATCH',route+'/close',{})).data.ticket;assert.equal(live.status,'CLOSED');assert.ok(live.closedAt);after=await snapshot(id);assert.equal(after.history.length,11);assert.equal(after.history.filter(h=>h.to_status==='RESOLVED').length,2);assert.equal(after.audits.length,1);assert.equal(after.audits[0].action,'TICKET_ASSIGNED');
    const apiHistory=(await api(admin,'GET',route+'/status-history')).data.history;assert.deepEqual(apiHistory.map(h=>String(h.id)),after.history.map(h=>String(h.id)));assert.equal(new Set(after.history.map(h=>h.to_status)).size,6);
    await api(employee,'PUT',route+'/feedback',{rating:5,comment:'Closed lifecycle feedback.'});assert.equal((await api(employee,'GET',route)).data.ticket.status,'CLOSED');
    assert.ok(deadlines.every(Boolean));assert.ok(live.responseDueAt&&live.resolutionDueAt);checks++;
    for(const from of ['RESOLVED','CLOSED'])for(const [actor,action,body] of [[employee,'',{title:'Rejected edit'}],[admin,'/priority',{priorityId:String(fixture.priority.id)}],[technician,'/comments',{content:'Rejected public reply.'}],[technician,'/internal-notes',{content:'Staff internal follow-up.'}]])await isolated('state mutability '+from+action,async()=>{
      const ticket=fixture.states[from],before=await snapshot(ticket.id);const allowed=from==='RESOLVED'&&action==='/internal-notes';
      await api(actor,action==='/comments'||action==='/internal-notes'?'POST':'PATCH','/tickets/'+ticket.id+action,body,allowed?201:409);if(!allowed)assert.deepEqual(await snapshot(ticket.id),before);
    });
    for(const from of ['RESOLVED','CLOSED'])await isolated('attachment state guard '+from,async()=>{
      const ticket=fixture.states[from],before=await snapshot(ticket.id),form=new FormData();form.append('attachment',new Blob(['Harmless state guard'],{type:'text/plain'}),'guard.txt');
      const response=await fetch('http://localhost:5099/api/v1/tickets/'+ticket.id+'/attachments',{method:'POST',headers:{Authorization:'Bearer '+technician.token},body:form});assert.equal(response.status,409);await response.arrayBuffer();assert.deepEqual(await snapshot(ticket.id),before);
    });
    stage='list/dashboard consistency';const my=(await api(employee,'GET','/tickets/my?limit=100')).data.tickets;assert.equal(my.find(t=>String(t.id)===id).status,'CLOSED');
    const queue=(await api(admin,'GET','/tickets/queue?limit=100&search='+encodeURIComponent(live.ticketNumber))).data.tickets;assert.equal(queue[0].status,'CLOSED');
    const active=(await api(technician,'GET','/tickets/assigned-to-me?limit=100')).data.tickets;assert.ok(!active.some(t=>String(t.id)===id));
    const unassigned=(await api(admin,'GET','/tickets/queue?assignment=unassigned&limit=100&search='+encodeURIComponent(live.ticketNumber))).data.tickets;assert.equal(unassigned.length,0);
    const distribution=(await api(technician,'GET','/dashboard/status-distribution')).data.distribution;const [sqlCount]=await db.execute("SELECT COUNT(*) AS total FROM tickets WHERE assigned_to=? AND status='CLOSED'",[technician.id]);assert.equal(distribution.find(row=>row.status==='CLOSED').count,Number(sqlCount[0].total));checks++;
    console.log(`PASS: ${checks} real HTTP/MySQL lifecycle cases; matrix, actors, history, timestamps, mutability and side effects.`);
  }catch(error){const line=[...String(error.stack).matchAll(/ticket\.lifecycle\.mysql\.smoke\.js:(\d+)/g)].at(-1)?.[1];console.error('Lifecycle SQL smoke failed at '+stage+' (line '+(line||'unknown')+'; '+error.name+'; details suppressed).');if(error.code==='ERR_ASSERTION'&&typeof error.actual==='number'&&typeof error.expected==='number')console.error('Numeric assertion: '+error.actual+' vs '+error.expected);process.exitCode=1;}
  finally{if(fixture){await fixture.cleanup();console.log('Lifecycle fixtures and histories rolled back; no provider traffic or files retained.');}}
})();
