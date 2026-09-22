import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getAdminDashboardSection } from '../../api/dashboardApi'
import { ticketStatuses, formatTicketStatus, formatTicketPriority, formatTicketDate } from '../employee/ticketFormatting'

const action = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700'

export default function AdminDashboardPage() {
  const { user } = useAuth()
  const name = typeof user?.firstName === 'string' ? user.firstName.trim() : ''
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold sm:text-3xl">Welcome back{name ? `, ${name}` : ''}</h1><p className="mt-2 text-slate-600">Here's an overview of your support operations.</p>
      <div className="mt-5 flex flex-wrap gap-3">{[['Manage Users', 'users'], ['View All Tickets', 'tickets'], ['View Analytics', 'analytics'], ['View Reports', 'reports']].map(([label, path]) => <Link key={path} className={action} to={`/admin/${path}`}>{label}</Link>)}</div>
    </header>
    <DashboardSection key={`${user?.id}:summary`} kind="summary" title="Ticket overview" />
    <div className="grid min-w-0 gap-6 xl:grid-cols-2"><DashboardSection key={`${user?.id}:recent`} kind="recent" title="Recent tickets" /><DashboardSection key={`${user?.id}:priority`} kind="priority" title="Tickets by priority" /></div>
    <DashboardSection key={`${user?.id}:sla`} kind="sla" title="SLA overview" />
    <DashboardSection key={`${user?.id}:workload`} kind="workload" title="Technician workload preview" />
  </div>
}

function DashboardSection({ kind, title }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getAdminDashboardSection(kind, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ attempt, data })
    }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }) })
    return () => controller.abort()
  }, [kind, attempt])
  const current = result?.attempt === attempt ? result : null
  return <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    {!current ? <p role="status">Loading dashboard...</p> : current.error ? <><AuthFeedback>Unable to load the admin dashboard.</AuthFeedback><button type="button" className={action} onClick={() => setAttempt(value => value + 1)}>Retry</button></> : <AdminDashboardSectionContent kind={kind} data={current.data} />}
  </section>
}

export function AdminDashboardSectionContent({ kind, data }) {
  if (kind === 'workload') return <>
    <p className="text-sm text-slate-600">Current active assignments. Showing up to five technicians in server order.</p>
    {!data.length ? <p>No technician workload data available yet.</p> : <dl className="space-y-3">{data.slice(0, 5).map(row => <div key={row.technicianId} className="flex flex-wrap justify-between gap-3"><dt>{row.technicianName || 'Name unavailable'}</dt><dd className="font-semibold">{row.activeTickets} active tickets</dd></div>)}</dl>}
    <Link to="/admin/technicians" className={action}>View Technicians</Link>
  </>
  if (kind === 'summary') return <>
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">{[['Total Tickets', 'totalTickets'], ['Active Tickets', 'activeTickets'], ['Unassigned Tickets', 'unassignedTickets'], ['Resolved Tickets', 'resolvedTickets'], ['Closed Tickets', 'closedTickets']].map(([label, field]) => <div key={field} className={`min-w-0 rounded-xl border p-4 ${field === 'unassignedTickets' ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{data[field]}</dd></div>)}</dl>
    <Link className={action} to="/admin/tickets">Review ticket queue</Link>
    {data.totalTickets === 0 ? <p>No ticket activity yet.</p> : <div><h3 className="font-semibold">Tickets by status</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{ticketStatuses.map(status => <div key={status.value} className="flex justify-between gap-3 text-sm"><dt>{status.label}</dt><dd className="font-semibold">{data[status.countField]}</dd></div>)}</dl></div>}
  </>
  if (kind === 'recent') return !data.length ? <p>No ticket activity yet.</p> : <ul className="divide-y divide-slate-200">{data.map(ticket => <li key={ticket.id} className="min-w-0 py-4 first:pt-0 last:pb-0"><p className="break-all text-sm font-semibold text-teal-800">{ticket.ticketNumber}</p><h3 className="mt-1 break-words font-semibold">{ticket.title}</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{[['Status', formatTicketStatus(ticket.status)], ['Priority', formatTicketPriority(ticket.priority?.name)], ['Category', ticket.category?.name || 'Not specified'], ['Created', formatTicketDate(ticket.createdAt)]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl></li>)}</ul>
  if (kind === 'priority') return data.every(row => row.count === 0) ? <p>No ticket activity yet.</p> : <dl className="space-y-3">{data.map(row => <div key={row.priorityId} className="flex justify-between gap-4"><dt>{formatTicketPriority(row.priorityName)}</dt><dd className="font-semibold tabular-nums">{row.count}</dd></div>)}</dl>
  return <><p className="text-sm text-slate-600">Compliance measures completed milestones. Pending milestones may already be overdue.</p><div className="grid gap-6 sm:grid-cols-2">{['response', 'resolution'].map(target => <div key={target}><h3 className="font-semibold">{target === 'response' ? 'First response' : 'Resolution'}</h3>{data[target].trackedTickets === 0 ? <p className="mt-3 text-sm">No SLA data available yet.</p> : <dl className="mt-3 space-y-2">{[['Met', 'metTickets'], ['Missed', 'missedTickets'], ['Pending', 'pendingTickets']].map(([label, field]) => <div key={field} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold">{data[target][field]}</dd></div>)}<div className="flex flex-wrap justify-between gap-3"><dt>Compliance</dt><dd className="font-semibold">{data[target].compliancePercentage === null ? 'Not available' : `${data[target].compliancePercentage}%`}</dd></div></dl>}</div>)}</div></>
}
