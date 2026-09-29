import { formatTicketDate, formatTicketPriority, formatTicketStatus } from '../employee/ticketFormatting'
import { formatAnalyticsMinutes } from './analyticsFormatting'
import { reportTypes } from '../../api/reportApi'

const percentage = value => value == null ? 'Not available' : `${value}%`
const date = value => value == null ? '—' : formatTicketDate(value)
export default function ReportResults({ type, report }) {
  let columns, rows = report[reportTypes[type].rows] || []
  if (type === 'tickets') columns = [['Ticket', row => row.ticketNumber], ['Title', row => row.title], ['Requester', row => row.requester?.name || row.requester?.email], ['Category', row => row.category?.name], ['Priority', row => formatTicketPriority(row.priority?.name)], ['Status', row => formatTicketStatus(row.status)], ['Technician', row => row.assignedTechnician?.name || row.assignedTechnician?.email || 'Unassigned'], ['Created', row => date(row.createdAt)], ['Resolved', row => date(row.resolvedAt)]]
  else if (type === 'date-range') columns = [['UTC date', row => row.date], ['Created tickets', row => row.ticketCount]]
  else if (type === 'technician-performance') columns = [['Technician', row => row.technicianName || row.email], ['Account', row => row.isActive ? 'Active' : 'Inactive'], ['Assigned tickets', row => row.assignedTickets], ['Resolved tickets', row => row.resolvedTickets], ['Average response', row => formatAnalyticsMinutes(row.averageFirstResponseMinutes)], ['Response samples', row => row.firstResponseSamples], ['Average resolution', row => formatAnalyticsMinutes(row.averageResolutionMinutes)], ['Resolution samples', row => row.resolutionSamples], ['Response SLA compliance', row => percentage(row.responseSlaCompliancePercentage)], ['Resolution SLA compliance', row => percentage(row.resolutionSlaCompliancePercentage)]]
  else if (type === 'sla') {
    rows = [{ name: 'Response', ...report.responseSla }, { name: 'Resolution', ...report.resolutionSla }]
    columns = [['Milestone', row => row.name], ['Tracked', row => row.trackedTickets], ['Met', row => row.metTickets], ['Missed', row => row.missedTickets], ['Pending', row => row.pendingTickets], ['Completed', row => row.completedTickets], ['Compliance', row => percentage(row.compliancePercentage)]]
  } else {
    columns = [[type === 'categories' ? 'Category' : type === 'priorities' ? 'Priority' : 'Status', row => type === 'categories' ? row.categoryName : type === 'priorities' ? formatTicketPriority(row.priorityName) : formatTicketStatus(row.status)], ['Tickets', row => row.totalTickets]]
    if (type === 'categories') columns.push(['Category state', row => row.isActive ? 'Active' : 'Inactive'])
    if (type !== 'statuses') columns.push(['Active tickets', row => row.activeTickets], ['Resolved', row => row.resolvedTickets], ['Closed', row => row.closedTickets])
    columns.push(['Share of tickets', row => percentage(row.percentageOfTickets)])
  }
  const empty = !rows.length || (report.totalTickets === 0) || (type === 'sla' && rows.every(row => row.trackedTickets === 0))
  return <div className="space-y-4">
    {report.totalTickets !== undefined && <p className="font-semibold">Total tickets: {report.totalTickets}</p>}
    {type === 'tickets' && <p className="font-semibold">Matching tickets: {report.pagination.totalItems}</p>}
    {type === 'technician-performance' && <p className="text-sm text-slate-600">Historical assignments and resolution events, not current workload. A ticket may count for multiple technicians. Timing and SLA use attributable completion samples; durations are formatted from minutes.</p>}
    {type === 'sla' && <p className="text-sm text-slate-600">Compliance covers completed milestones only. Pending milestones can already be overdue; no live warning or breach state is calculated here.</p>}
    {empty ? <p>No report data found for the selected criteria.</p> : <div className="max-h-[40rem] overflow-auto rounded-lg border border-slate-200" tabIndex={0} aria-label="Scrollable report results"><table className="w-full text-left text-sm"><caption className="sr-only">{reportTypes[type].label}</caption><thead className="bg-slate-50"><tr>{columns.map(([label]) => <th scope="col" key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || row.technicianId || row.categoryId || row.priorityId || row.status || row.date || row.name || index} className="border-t border-slate-200">{columns.map(([label, value]) => <td key={label} className="min-w-28 p-3 align-top">{value(row)}</td>)}</tr>)}</tbody></table></div>}
  </div>
}
