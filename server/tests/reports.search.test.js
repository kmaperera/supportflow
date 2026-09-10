const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeTicketReportQuery}=require('../src/modules/reports/reports.validation');
const repository=require('../src/modules/reports/reports.repository');
const service=require('../src/modules/reports/reports.service');
test('ticket search validation is strict and sorting defaults remain stable',()=>{
 assert.deepEqual(normalizeTicketReportQuery({search:'  wifi  ',sortOrder:'aSc'}),{filters:{search:'wifi'},pagination:{page:1,limit:25,offset:0},sorting:{sortBy:'createdAt',sortOrder:'ASC'}});
 assert.deepEqual(normalizeTicketReportQuery({search:'  '}).filters,{});
 for(const value of [{search:[]},{search:'x'.repeat(101)},{sortBy:'constructor'},{sortBy:'t.id'},{sortOrder:'ASC; DROP TABLE tickets'}, {sortOrder:[]},...['0','-1','1.5','abc'].flatMap(v=>[{page:v},{limit:v}]),{limit:'101'}]) assert.throws(()=>normalizeTicketReportQuery(value),{statusCode:422});
});
test('search binds literal patterns and count/data share predicates with pagination beyond last page',async()=>{
 const calls=[];
 const {report}=await service.getTicketReportQuery({search:"  %_!wifi'  ",status:'OPEN',priorityId:'3',page:'5',limit:'25',sortBy:'technician',sortOrder:'asc'},{async query(sql,params){calls.push({sql,params});return sql.includes('COUNT(*)')?[[{total:'26'}]]:[[]];}});
 assert.deepEqual(report.pagination,{page:5,limit:25,totalItems:26,totalPages:2});
 assert.deepEqual(report.rows,[]);
 assert.equal(report.filters.search,"%_!wifi'");
 assert.deepEqual(report.sorting,{sortBy:'technician',sortOrder:'ASC'});
 assert.deepEqual(calls[0].params.slice(0,-2),calls[1].params);
 assert.deepEqual(calls[1].params,['OPEN',3,...Array(8).fill("%!%!_!!wifi'%")]);
 assert.equal(calls[0].sql.split(' WHERE ')[1].split(' ORDER BY ')[0].trim(),calls[1].sql.split(' WHERE ')[1].trim());
 assert.match(calls[0].sql,/ORDER BY technician.first_name ASC, t.id ASC LIMIT \? OFFSET \?/);
 for(const call of calls){assert.match(call.sql,/LEFT JOIN users AS technician/);assert.match(call.sql,/AND \(t.ticket_number LIKE \? ESCAPE '!'/);assert.doesNotMatch(call.sql,/wifi|history|comments|notifications/);}
});
test('every sort uses whitelisted columns and deterministic ID ordering',async()=>{
 const columns={createdAt:'t.created_at',ticketNumber:'t.ticket_number',title:'t.title',status:'t.status',category:'c.name',priority:'p.name',requester:'requester.first_name',technician:'technician.first_name'};
 for(const [sortBy,column] of Object.entries(columns)) for(const sortOrder of ['ASC','DESC']) await repository.getTicketReportRows({filters:{},pagination:{limit:25,offset:0},sorting:{sortBy,sortOrder}},{async query(sql){assert.ok(sql.includes(`ORDER BY ${column} ${sortOrder}, t.id ${sortOrder}`));return [[]];}});
 await assert.rejects(repository.getTicketReportRows({filters:{},pagination:{limit:25,offset:0},sorting:{sortBy:'constructor',sortOrder:'ASC'}}),/Invalid report sorting/);
});
