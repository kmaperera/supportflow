const service = require('./reports.service');
const pool = require('../../config/database');
const { normalizePerformanceQuery } = require('./reports.validation');
const { TICKET_STATUSES: S } = require('../../constants/ticketStatuses');
const { generatePdfReport, buildPdfFilename } = require('../../utils/pdf');
const column = (header, key) => ({ header, key });
const percentage = (header, key) => ({ header, value: row => row[key] == null ? '' : `${row[key]}%` });
async function getAnalyticsPdfExport(params = {}, db) {
  const filters = normalizePerformanceQuery(params);
  const methods = ['getTechnicianPerformanceReport','getSlaReport','getCategoryReport','getPriorityReport','getStatusReport'];
  let results;
  if (db === undefined || db === pool) results = await Promise.all(methods.map(method => service[method](filters, db)));
  else { results = []; for (const method of methods) results.push(await service[method](filters, db)); }
  const [technician, sla, category, priority, status] = results.map(result => result.report);
  const counts = new Map(status.statuses.map(row => [row.status, row.totalTickets]));
  const active = [S.OPEN,S.ASSIGNED,S.IN_PROGRESS,S.WAITING_FOR_USER,S.REOPENED].reduce((sum,key)=>sum+(counts.get(key) ?? 0),0);
  const sections = [
    { title: 'Overview', columns: [column('Metric','metric'),column('Tickets','count')], rows: [
      {metric:'Total Tickets',count:status.totalTickets},{metric:'Active Tickets',count:active},
      {metric:'Resolved Tickets',count:counts.get(S.RESOLVED) ?? 0},{metric:'Closed Tickets',count:counts.get(S.CLOSED) ?? 0}] },
    { title:'SLA Performance', columns:[column('SLA Type','type'),column('Tracked','trackedTickets'),column('Met','metTickets'),column('Missed','missedTickets'),column('Pending','pendingTickets'),column('Completed','completedTickets'),percentage('Compliance %','compliancePercentage')],rows:[{type:'Response',...sla.responseSla},{type:'Resolution',...sla.resolutionSla}] },
    { title:'Status Distribution',columns:[column('Status','status'),column('Tickets','totalTickets'),percentage('Percentage','percentageOfTickets')],rows:status.statuses },
    { title:'Category Distribution',columns:[column('Category','categoryName'),column('Category Active','isActive'),column('Total','totalTickets'),column('Active Tickets','activeTickets'),column('Resolved','resolvedTickets'),column('Closed','closedTickets'),percentage('Percentage','percentageOfTickets')],rows:category.categories },
    { title:'Priority Distribution',columns:[column('Priority','priorityName'),column('Total','totalTickets'),column('Active','activeTickets'),column('Resolved','resolvedTickets'),column('Closed','closedTickets'),percentage('Percentage','percentageOfTickets')],rows:priority.priorities },
    { title:'Technician Performance',columns:[column('Technician','technicianName'),column('Active','isActive'),column('Assigned','assignedTickets'),column('Resolved','resolvedTickets'),column('Avg Response (min)','averageFirstResponseMinutes'),column('Avg Resolution (min)','averageResolutionMinutes'),percentage('Response SLA %','responseSlaCompliancePercentage'),percentage('Resolution SLA %','resolutionSlaCompliancePercentage')],rows:technician.technicians },
  ];
  const subtitle = filters.startDate && filters.endDate ? `Report Period: ${filters.startDate} to ${filters.endDate}` : filters.startDate ? `From: ${filters.startDate}` : filters.endDate ? `Through: ${filters.endDate}` : 'Report Period: All available data';
  const pdfBuffer = await generatePdfReport({title:'SupportFlow Analytics Report',subtitle,orientation:'landscape',sections});
  return {pdfBuffer,filename:buildPdfFilename('supportflow-analytics-report')};
}
module.exports = { getAnalyticsPdfExport };
