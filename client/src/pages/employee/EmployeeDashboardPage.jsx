import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import SummaryCard from '../../layouts/SummaryCard'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getEmployeeDashboard } from '../../api/dashboardApi'
import { getApiErrorMessage } from '../../api/apiError'
import { ticketStatuses, formatTicketStatus, formatTicketPriority, formatTicketDate } from './ticketFormatting'

const actionClass = 'inline-flex rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700'
const panelClass = 'layout-panel'

export function EmployeeDashboardContent({ data }) {
  const { summary, tickets } = data
  return <>
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Total Tickets', summary.totalTickets], ['Active Tickets', summary.activeTickets],
        ['Resolved Tickets', summary.resolvedTickets], ['Closed Tickets', summary.closedTickets],
      ].map(([label, count]) => <SummaryCard key={label} label={label} value={count} />)}
    </dl>
    {summary.totalTickets === 0 ? <EmptyState titleId="empty-tickets-heading" title="You haven't created any support tickets yet." message="Create your first support ticket to get help." actions={<Link to="/employee/tickets/new" className={actionClass}>Create your first ticket</Link>} /> : <>
      <section className={panelClass} aria-labelledby="recent-tickets-heading">
        <h2 id="recent-tickets-heading" className="text-lg font-semibold">Recent Tickets</h2>
        <p className="mt-1 text-sm text-slate-500">Your latest support requests, newest first.</p>
        {tickets.length === 0 ? <EmptyState compact title="No recent tickets available." /> :
          <ul className="mt-4 divide-y divide-slate-200">
            {tickets.map(ticket => <li key={ticket.id} className="py-4 first:pt-0 last:pb-0">
              <p className="break-all text-xs font-semibold text-teal-800">{ticket.ticketNumber}</p>
              <h3 className="mt-1 break-words font-medium">{ticket.title}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-teal-50 px-3 py-1 font-medium text-teal-900">{formatTicketStatus(ticket.status)}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Priority: {formatTicketPriority(ticket.priority?.name)}</span>
                <span className="text-slate-500">Created {formatTicketDate(ticket.createdAt)}</span>
              </div>
            </li>)}
          </ul>}
      </section>
      <section className={panelClass} aria-labelledby="ticket-status-heading">
        <h2 id="ticket-status-heading" className="text-lg font-semibold">Ticket status overview</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {ticketStatuses.map(status => <div key={status.value} className="flex justify-between gap-4 text-sm">
            <dt className="text-slate-600">{status.label}</dt>
            <dd className="font-semibold tabular-nums">{summary[status.countField]}</dd>
          </div>)}
        </dl>
      </section>
    </>}
  </>
}

export default function EmployeeDashboardPage() {
  const { user } = useAuth()
  // Remount request state when the authenticated account changes.
  return <EmployeeDashboard key={user?.id} user={user} />
}

function EmployeeDashboard({ user }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    getEmployeeDashboard({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, data, error: null })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ loading: false, data: null, error: getApiErrorMessage(error, 'Unable to load your dashboard.') })
    })
    return () => controller.abort()
  }, [attempt])
  const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : ''
  return <div className="layout-page">
    <PageHeader titleId="dashboard-heading" title={<>Welcome back{firstName ? `, ${firstName}` : ''}</>} description="Here's an overview of your support requests." actions={<>
        <Link to="/employee/tickets/new" className={actionClass}>Create Ticket</Link>
        <Link to="/employee/tickets" className={actionClass}>View My Tickets</Link>
      </>} />
    {state.loading && <ContentSkeleton initial={!state.data && attempt === 0} variant="dashboard">Loading dashboard...</ContentSkeleton>}
    {state.error && <div className={panelClass}>
      <AuthFeedback>{state.error}</AuthFeedback>
      <button type="button" className={`${actionClass} mt-4`} onClick={() => {
        setState({ loading: true, data: null, error: null })
        setAttempt(value => value + 1)
      }}>Retry</button>
    </div>}
    {state.data && <EmployeeDashboardContent data={state.data} />}
  </div>
}
