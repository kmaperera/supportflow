import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getMyTickets } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import { formatTicketDate, formatTicketPriority, formatTicketStatus } from './ticketFormatting'
import TicketFilters from './TicketFilters'

const actionClass = 'inline-block rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50'

export default function MyTicketsPage() {
  const { user } = useAuth()
  return <MyTickets key={user?.id} />
}

function MyTickets() {
  const location = useLocation()
  const navigate = useNavigate()
  const [createdNumber, setCreatedNumber] = useState(() => typeof location.state?.createdTicketNumber === 'string' ? location.state.createdTicketNumber : null)
  const [request, setRequest] = useState({ page: 1, attempt: 0 })
  const [result, setResult] = useState(null)
  const [search, setSearch] = useState('')
  function changeFilters(changes) {
    setRequest(previous => ({ ...previous, ...changes, search: search.trim(), page: 1, attempt: 0 }))
  }
  function resetFilters() {
    setSearch('')
    setRequest({ page: 1, attempt: 0 })
  }
  const filtered = Boolean(request.search || request.status || request.categoryId || request.priorityId)
  useEffect(() => {
    if (typeof location.state?.createdTicketNumber === 'string') {
      const { createdTicketNumber: _consumed, ...rest } = location.state
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: rest })
    }
  }, [location, navigate])
  useEffect(() => {
    const controller = new AbortController()
    getMyTickets({ ...request, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ request, data, error: null })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, data: null, error: getApiErrorMessage(error, 'Unable to load your tickets.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">My Tickets</h1><p className="mt-2 text-slate-600">Track your support requests and their current status.</p></div>
      <Link to="/employee/tickets/new" className={actionClass}>Create Ticket</Link>
    </header>
    <TicketFilters query={request} search={search} setSearch={setSearch} onChange={changeFilters} onSearch={() => changeFilters({})} onReset={resetFilters} />
    {createdNumber && <div>
      <AuthFeedback variant="success">Ticket {createdNumber} created successfully.</AuthFeedback>
      <button type="button" onClick={() => setCreatedNumber(null)} className="mt-2 rounded text-sm text-teal-800 underline focus-visible:outline-2">Dismiss confirmation</button>
    </div>}
    {!current && <p role="status" className="text-sm text-slate-600">{result ? 'Updating tickets...' : 'Loading tickets...'}</p>}
    {current?.error && <div className="space-y-3">
      <AuthFeedback>{current.error}</AuthFeedback>
      <button type="button" className={actionClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button>
    </div>}
    {current?.data && <>
      {filtered && current.data.tickets.length === 0 ? <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">No tickets match your current search or filters.</h2><button type="button" className={`${actionClass} mt-3`} onClick={resetFilters}>Clear filters</button></section> : <MyTicketsList tickets={current.data.tickets} totalRecords={current.data.pagination.totalRecords} />}
      {(current.data.pagination.totalPages > 1 || request.page > 1) && <nav aria-label="Ticket pagination" className="flex flex-wrap items-center gap-4">
        <button type="button" className={actionClass} disabled={!current.data.pagination.hasPrevious} onClick={() => setRequest({ ...request, page: request.page - 1, attempt: 0 })}>Previous</button>
        <p className="text-sm text-slate-600">Page {current.data.pagination.currentPage} of {Math.max(1, current.data.pagination.totalPages)} · {current.data.pagination.totalRecords} tickets</p>
        <button type="button" className={actionClass} disabled={!current.data.pagination.hasNext} onClick={() => setRequest({ ...request, page: request.page + 1, attempt: 0 })}>Next</button>
      </nav>}
    </>}
  </div>
}

export function MyTicketsList({ tickets, totalRecords }) {
  if (!tickets.length) return <section className="rounded-2xl border border-slate-200 bg-white p-6">
    <h2 className="text-lg font-semibold">{totalRecords === 0 ? "You don't have any support tickets yet." : 'No tickets on this page.'}</h2>
    <Link to="/employee/tickets/new" className={`${actionClass} mt-4`}>Create Ticket</Link>
  </section>
  return <ul className="space-y-4">
    {tickets.map(ticket => <li key={ticket.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <Link to={`/employee/tickets/${encodeURIComponent(ticket.id)}`} className="rounded break-all text-sm font-semibold text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{ticket.ticketNumber}</Link>
      <h2 className="mt-1 break-words text-lg font-semibold">{ticket.title}</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-slate-500">Category</dt><dd className="mt-1 break-words">{ticket.category?.name || 'Not specified'}</dd></div>
        <div><dt className="text-slate-500">Priority</dt><dd className="mt-1">{formatTicketPriority(ticket.priority?.name)}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd className="mt-1 font-medium text-teal-900">{formatTicketStatus(ticket.status)}</dd></div>
        <div><dt className="text-slate-500">Created</dt><dd className="mt-1">{formatTicketDate(ticket.createdAt)}</dd></div>
      </dl>
    </li>)}
  </ul>
}
