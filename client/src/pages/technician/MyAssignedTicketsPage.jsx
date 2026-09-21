import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getApiErrorMessage } from '../../api/apiError'
import { getMyAssignedTickets } from '../../api/ticketApi'
import TechnicianTicketCards from './TechnicianTicketCards'

const actionClass = 'inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50'

export default function MyAssignedTicketsPage() {
  const { user } = useAuth()
  return <AssignedTickets key={user?.id} />
}

function AssignedTickets() {
  const [request, setRequest] = useState({ page: 1, attempt: 0 })
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getMyAssignedTickets({ page: request.page, limit: 10, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(error, 'Unable to load your assigned tickets.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  return <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-semibold">My Assigned Tickets</h1>
      <p className="mt-2 text-slate-600">Your active workload: Assigned, In Progress, Waiting for User, and Reopened tickets.</p>
    </header>
    {!current && <p role="status">Loading assigned tickets...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>{current.error}</AuthFeedback>
      <button type="button" className={actionClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button>
    </div>}
    {current?.data && <>
      <p className="text-sm text-slate-600">{current.data.pagination.totalRecords} assigned tickets</p>
      <AssignedTicketsList tickets={current.data.tickets} totalRecords={current.data.pagination.totalRecords} />
      {(current.data.pagination.totalPages > 1 || request.page > 1) && <nav aria-label="Assigned ticket pagination" className="flex flex-wrap items-center gap-3">
        <button type="button" className={actionClass} disabled={!current.data.pagination.hasPrevious} onClick={() => setRequest({ page: request.page - 1, attempt: 0 })}>Previous</button>
        <p className="text-sm">Page {current.data.pagination.currentPage} of {Math.max(1, current.data.pagination.totalPages)} · {current.data.pagination.limit} per page</p>
        <button type="button" className={actionClass} disabled={!current.data.pagination.hasNext} onClick={() => setRequest({ page: request.page + 1, attempt: 0 })}>Next</button>
      </nav>}
    </>}
  </div>
}

export function AssignedTicketsList({ tickets, totalRecords }) {
  if (!tickets.length) return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold">{totalRecords === 0 ? "You don't have any assigned tickets right now." : 'No assigned tickets on this page.'}</h2>
    <Link to="/technician/tickets/unassigned" className={`${actionClass} mt-4`}>View Unassigned Queue</Link>
  </section>
  return <TechnicianTicketCards tickets={tickets} />
}
