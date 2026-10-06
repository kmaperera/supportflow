import Pagination from '../../components/Pagination'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
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
  const [createdNumber] = useState(() => typeof location.state?.createdTicketNumber === 'string' ? location.state.createdTicketNumber : null)
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
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (request.page > lastPage) { setRequest(previous => previous === request ? { ...previous, page: lastPage } : previous); return }
      if (!controller.signal.aborted) setResult({ request, data, error: null })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, data: null, error: getApiErrorMessage(error, 'Unable to load your tickets.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  return <div className="layout-page">
    <PageHeader title="My Tickets" description="Track your support requests and their current status." actions={<><Link to="/employee/tickets/new" className={actionClass}>Create Ticket</Link></>} />
    <TicketFilters query={request} search={search} setSearch={setSearch} onChange={changeFilters} onSearch={() => changeFilters({})} onReset={resetFilters} />
    {createdNumber && <div>
      <AuthFeedback variant="success">Ticket {createdNumber} created successfully.</AuthFeedback>
    </div>}
    {!current && <ContentSkeleton initial={!result} variant="cards">{result ? 'Updating tickets...' : 'Loading tickets...'}</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load tickets" message={<>{current.error}</>}>
      <button type="button" className={actionClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button>
    </ErrorState>}
    {current?.data && <>
      {filtered && current.data.tickets.length === 0 ? <EmptyState title="No tickets match your current search or filters." actions={<button type="button" className={`${actionClass} cursor-pointer`} onClick={resetFilters}>Clear filters</button>} /> : <MyTicketsList tickets={current.data.tickets} totalRecords={current.data.pagination.totalRecords} />}
      <Pagination metadata={current.data.pagination} noun="tickets" label="tickets" disabled={false} onPageChange={page => setRequest(previous => ({ ...previous, page }))} />
    </>}
  </div>
}

export function MyTicketsList({ tickets, totalRecords }) {
  if (!tickets.length) return <EmptyState title={totalRecords === 0 ? "You don't have any support tickets yet." : 'No tickets on this page.'} actions={<Link to="/employee/tickets/new" className={actionClass}>Create Ticket</Link>} />
  return <ul className="space-y-4">
    {tickets.map(ticket => <li key={ticket.id} className="min-w-0">
      <Link to={`/employee/tickets/${encodeURIComponent(ticket.id)}`} aria-labelledby={`ticket-number-${ticket.id} ticket-title-${ticket.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:p-6">
      <span id={`ticket-number-${ticket.id}`} className="break-all text-sm font-semibold text-teal-800 underline underline-offset-4">{ticket.ticketNumber}</span>
      <h2 id={`ticket-title-${ticket.id}`} className="mt-1 break-words text-lg font-semibold">{ticket.title}</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-slate-500">Category</dt><dd className="mt-1 break-words">{ticket.category?.name || 'Not specified'}</dd></div>
        <div><dt className="text-slate-500">Priority</dt><dd className="mt-1">{formatTicketPriority(ticket.priority?.name)}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd className="mt-1 font-medium text-teal-900">{formatTicketStatus(ticket.status)}</dd></div>
        <div><dt className="text-slate-500">Created</dt><dd className="mt-1">{formatTicketDate(ticket.createdAt)}</dd></div>
      </dl>
      </Link>
    </li>)}
  </ul>
}
