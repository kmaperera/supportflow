import ContentSkeleton from '../../components/ContentSkeleton'

const headers = {
  tickets: ['Ticket', 'Title', 'Requester', 'Category', 'Priority', 'Status', 'Technician', 'Created', 'Resolved'],
  'date-range': ['UTC date', 'Created tickets'],
  'technician-performance': ['Technician', 'Account', 'Assigned tickets', 'Resolved tickets', 'Average response', 'Response samples', 'Average resolution', 'Resolution samples', 'Response SLA compliance', 'Resolution SLA compliance'],
  sla: ['Milestone', 'Tracked', 'Met', 'Missed', 'Pending', 'Completed', 'Compliance'],
  categories: ['Category', 'Tickets', 'Category state', 'Active tickets', 'Resolved', 'Closed', 'Share of tickets'],
  priorities: ['Priority', 'Tickets', 'Active tickets', 'Resolved', 'Closed', 'Share of tickets'],
  statuses: ['Status', 'Tickets', 'Share of tickets'],
}
export default function ReportSkeleton({ type, initial }) {
  return <ContentSkeleton initial={initial} variant="report" headers={headers[type]}>Generating report...</ContentSkeleton>
}
