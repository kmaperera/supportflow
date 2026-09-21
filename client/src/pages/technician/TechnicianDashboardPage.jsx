import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getApiErrorMessage } from '../../api/apiError'
import { getTechnicianDashboard } from '../../api/dashboardApi'
import { ticketStatuses, formatTicketStatus, formatTicketPriority, formatTicketDate } from '../employee/ticketFormatting'

const panelClass = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6'
const actionClass = 'inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700'

export default function TechnicianDashboardPage() {
  const { user } = useAuth()
  return <TechnicianDashboard key={user?.id} user={user} />
}

function TechnicianDashboard({ user }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    getTechnicianDashboard({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, data, error: null })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ loading: false, data: null, error: getApiErrorMessage(error, 'Unable to load your dashboard.') })
    })
    return () => controller.abort()
  }, [attempt])
  const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : ''
  return <div className="space-y-6">
    <section aria-labelledby="technician-dashboard-heading">
      <h1 id="technician-dashboard-heading" className="text-2xl font-semibold sm:text-3xl">Welcome back{firstName ? `, ${firstName}` : ''}</h1>
      <p className="mt-2 text-slate-600">Here's an overview of your support workload.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to="/technician/tickets/assigned" className={actionClass}>View My Assigned Tickets</Link>
        <Link to="/technician/tickets/unassigned" className={actionClass}>View Unassigned Queue</Link>
      </div>
    </section>
    {state.loading && <p role="status" className={panelClass}>Loading dashboard...</p>}
    {state.error && <div className={panelClass}>
      <AuthFeedback>{state.error}</AuthFeedback>
      <button type="button" className={`${actionClass} mt-4`} onClick={() => {
        setState({ loading: true, data: null, error: null }); setAttempt(value => value + 1)
      }}>Retry</button>
    </div>}
    {state.data && <TechnicianDashboardContent data={state.data} />}
  </div>
}

export function TechnicianDashboardContent({ data: { summary, tickets, sla } }) {
  return <>
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Active Assigned Tickets', summary.activeAssignedTickets], ['Assigned', summary.assignedTickets],
        ['Waiting for User', summary.waitingForUserTickets], ['Resolved Tickets', summary.resolvedTickets],
      ].map(([label, count]) => <div key={label} className={panelClass}>
        <dt className="text-sm font-medium text-slate-600">{label}</dt>
        <dd className="mt-3 text-3xl font-semibold tabular-nums">{count}</dd>
      </div>)}
    </dl>
    <section className={panelClass} aria-labelledby="recent-assigned-heading">
      <h2 id="recent-assigned-heading" className="text-lg font-semibold">Recent Assigned Tickets</h2>
      <p className="mt-1 text-sm text-slate-500">Tickets currently assigned to you, newest created first.</p>
      {!tickets.length ? <div className="mt-4">
        <p>You don't have any assigned tickets right now.</p>
        <Link to="/technician/tickets/unassigned" className={`${actionClass} mt-4`}>View Unassigned Queue</Link>
      </div> : <ul className="mt-4 divide-y divide-slate-200">
        {tickets.map(ticket => <li key={ticket.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
          <p className="text-sm font-semibold text-teal-800">{ticket.ticketNumber}</p>
          <h3 className="mt-1 font-medium">{ticket.title}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-teal-50 px-3 py-1 font-medium text-teal-900">{formatTicketStatus(ticket.status)}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Priority: {formatTicketPriority(ticket.priority?.name)}</span>
            <span className="text-slate-500">Created {formatTicketDate(ticket.createdAt)}</span>
          </div>
        </li>)}
      </ul>}
    </section>
    <section className={panelClass} aria-labelledby="workload-heading">
      <h2 id="workload-heading" className="text-lg font-semibold">My workload by status</h2>
      <p className="mt-1 text-sm text-slate-500">Active work includes Assigned, In Progress, Waiting for User, and Reopened tickets.</p>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {ticketStatuses.filter(status => Object.hasOwn(summary, status.countField)).map(status => <div key={status.value} className="flex min-w-0 justify-between gap-4 text-sm">
          <dt className="text-slate-600">{status.label}</dt><dd className="font-semibold tabular-nums">{summary[status.countField]}</dd>
        </div>)}
      </dl>
    </section>
    <section className={panelClass} aria-labelledby="sla-overview-heading">
      <h2 id="sla-overview-heading" className="text-lg font-semibold">SLA overview</h2>
      <p className="mt-1 text-sm text-slate-500">Met and missed counts reflect completed milestones. Pending milestones may already be overdue.</p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        {['response', 'resolution'].map(kind => <div key={kind} className="min-w-0">
          <h3 className="font-medium">{kind === 'response' ? 'First response' : 'Resolution'}</h3>
          <dl className="mt-2 space-y-2 text-sm">
            {[['Met', 'metTickets'], ['Missed', 'missedTickets'], ['Pending', 'pendingTickets']].map(([label, field]) => <div key={field} className="flex justify-between gap-4"><dt className="text-slate-600">{label}</dt><dd className="font-semibold tabular-nums">{sla[kind][field]}</dd></div>)}
          </dl>
        </div>)}
      </div>
    </section>
  </>
}
