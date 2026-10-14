// Dedicated lifecycle rows; actual API/services and rollback-isolated local SQL.
module.exports = async function lifecycleWorkflowFixture() {
  const fixture = await require('./employeeWorkflowFixture')({ includeTechnicianB:true });
  const sockets = new Set(), active = new Map(), server = fixture.io.httpServer;
  server.on('connection', socket => { sockets.add(socket); socket.once('close',()=>{sockets.delete(socket);active.delete(socket);}); });
  server.on('request',(request,response)=>{
    const socket=request.socket;active.set(socket,(active.get(socket)||0)+1);let finished=false;
    const done=()=>{if(finished)return;finished=true;const remaining=Math.max(0,(active.get(socket)||1)-1);if(remaining)active.set(socket,remaining);else active.delete(socket);};
    response.once('finish',done);response.once('close',done);if(response.writableFinished)done();
  });
  const cleanup=fixture.cleanup;
  fixture.cleanup=async()=>{
    const idle=setInterval(()=>{server.closeIdleConnections();for(const socket of sockets)if(!active.get(socket))socket.destroy();},250);
    try{await cleanup();}finally{clearInterval(idle);}
  };
  try {
    const [employee,,technician,admin]=fixture.users;
    employee.token=(await fixture.request(null,'POST','/auth/login',{email:employee.email,password:fixture.password})).data.accessToken;
    let sequence=0;
    fixture.create=async label=>(await fixture.request(employee,'POST','/tickets',{
      categoryId:fixture.categoryId,priorityId:String(fixture.priority.id),title:`Lifecycle ${fixture.run} ${label} ${++sequence}`,
      description:'Dedicated lifecycle fixture & <harmless> text.',
    },201)).data.ticket;
    const states=['OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','REOPENED','CLOSED'];
    fixture.states={};
    for(const status of states){
      let ticket=await fixture.create(status);const route='/tickets/'+ticket.id;
      if(status!=='OPEN')ticket=(await fixture.request(admin,'PATCH',route+'/assign',{technicianId:technician.id})).data.ticket;
      if(!['OPEN','ASSIGNED'].includes(status))ticket=(await fixture.request(technician,'PATCH',route+'/status',{status:'IN_PROGRESS'})).data.ticket;
      if(status==='WAITING_FOR_USER')ticket=(await fixture.request(technician,'PATCH',route+'/status',{status})).data.ticket;
      if(['RESOLVED','REOPENED','CLOSED'].includes(status))ticket=(await fixture.request(technician,'PATCH',route+'/resolve',{resolutionSummary:'Prepared lifecycle fixture resolution.'})).data.ticket;
      if(status==='REOPENED')ticket=(await fixture.request(employee,'PATCH',route+'/reopen',{})).data.ticket;
      if(status==='CLOSED')ticket=(await fixture.request(employee,'PATCH',route+'/close',{})).data.ticket;
      fixture.states[status]=ticket;
    }
    return fixture;
  }catch(error){await fixture.cleanup();throw error;}
};
