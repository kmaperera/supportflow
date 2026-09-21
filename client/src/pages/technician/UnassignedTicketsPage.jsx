import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getApiErrorMessage } from '../../api/apiError'
import { getUnassignedTickets } from '../../api/ticketApi'
import TechnicianTicketCards from './TechnicianTicketCards'
import QueueFilters from './QueueFilters'

const actionClass = 'inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50'

export default function UnassignedTicketsPage() {
  const { user } = useAuth()
  return <UnassignedQueue key={user?.id} />
}

function UnassignedQueue() {
  const [request, setRequest] = useState({ page: 1, attempt: 0 })
  const [result, setResult] = useState(null)
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (search.trim() === (request.search || '')) return
    const timer = setTimeout(() => setRequest(previous => ({ ...previous, search: search.trim(), page: 1, attempt: 0 })), 500)
    return () => clearTimeout(timer)
  }, [search, request.search])
  const changeFilters = changes => setRequest(previous => ({ ...previous, ...changes, search: search.trim(), page: 1, attempt: 0 }))
  function resetFilters() {
    setSearch('')
    setRequest({ page: 1, attempt: 0 })
  }
  const filtered = Boolean(request.search || request.status || request.categoryId || request.priorityId)
  useEffect(() => {
    const controller = new AbortController()
    getUnassignedTickets({ ...request, limit: 10, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(error, 'Unable to load the unassigned ticket queue.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  const reload = () => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="text-2xl font-semibold">Unassigned Ticket Queue</h1>
        <p className="mt-2 text-slate-600">Tickets without a currently assigned technician.</p></div>
      <button type="button" className={actionClass} disabled={!current} onClick={reload}>Refresh</button>
    </header>
    <QueueFilters query={request} search={search} setSearch={setSearch} onChange={changeFilters} onSearch={() => changeFilters({})} onReset={resetFilters} />
    {!current && <p role="status">{result ? 'Updating queue...' : 'Loading unassigned tickets...'}</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>{current.error}</AuthFeedback>
      <button type="button" className={actionClass} onClick={reload}>Retry</button>
    </div>}
    {current?.data && <>
      <p className="text-sm text-slate-600">{current.data.pagination.totalRecords} unassigned tickets</p>
      <UnassignedTicketsList tickets={current.data.tickets} totalRecords={current.data.pagination.totalRecords} filtered={filtered} onReset={resetFilters} />
      {(current.data.pagination.totalPages > 1 || request.page > 1) && <nav aria-label="Unassigned ticket pagination" className="flex flex-wrap items-center gap-3">
        <button type="button" className={actionClass} disabled={!current.data.pagination.hasPrevious} onClick={() => setRequest({ ...request, page: request.page - 1, attempt: 0 })}>Previous</button>
        <p className="text-sm">Page {current.data.pagination.currentPage} of {Math.max(1, current.data.pagination.totalPages)} · {current.data.pagination.limit} per page</p>
        <button type="button" className={actionClass} disabled={!current.data.pagination.hasNext} onClick={() => setRequest({ ...request, page: request.page + 1, attempt: 0 })}>Next</button>
      </nav>}
    </>}
  </div>
}

export function UnassignedTicketsList({ tickets, totalRecords, filtered = false, onReset }) {
  if (tickets.length) return <TechnicianTicketCards tickets={tickets} />
  if (filtered) return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold">No unassigned tickets match your current search or filters.</h2>
    <button type="button" onClick={onReset} className={`${actionClass} mt-4`}>Clear filters</button>
  </section>
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold">{totalRecords === 0 ? 'There are no unassigned tickets right now.' : 'No unassigned tickets on this page.'}</h2>
    <Link to="/technician/tickets/assigned" className={`${actionClass} mt-4`}>View My Assigned Tickets</Link>
  </section>
}
