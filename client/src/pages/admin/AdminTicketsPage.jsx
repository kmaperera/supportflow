import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminTickets, getTicketPriorities } from '../../api/ticketApi'
import { getCategories } from '../../api/categoryApi'
import AuthFeedback from '../../auth/AuthFeedback'
import { ticketStatuses, formatTicketPriority } from '../employee/ticketFormatting'
import AdminTicketMetadata from './AdminTicketMetadata'

const button = 'inline-flex min-h-11 w-fit cursor-pointer items-center rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50'
const defaults = { page: 1, search: '', status: '', categoryId: '', priorityId: '', assignment: '', sort: 'default', attempt: 0 }
const sorts = { default: [undefined, undefined], newest: ['created_at', 'desc'], oldest: ['created_at', 'asc'], priority: ['priority', 'desc'], status: ['status', 'asc'] }

export default function AdminTicketsPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState(defaults)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(previous => previous.search === search.trim() ? previous : { ...previous, search: search.trim(), page: 1 }), 500)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    const controller = new AbortController()
    const [sortBy, order] = sorts[query.sort]
    getAdminTickets({ ...query, sortBy, order, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (query.page > lastPage) { setQuery(previous => previous === query ? { ...previous, page: lastPage } : previous); return }
      setResult({ query, data })
    }).catch(() => { if (!controller.signal.aborted) setResult({ query, error: true }) })
    return () => controller.abort()
  }, [query])
  const current = result?.query === query ? result : null
  const filtered = Boolean(query.search || query.status || query.categoryId || query.priorityId || query.assignment)
  function change(values) { setQuery(previous => ({ ...previous, ...values, search: search.trim(), page: 1 })) }
  function reset() { setSearch(''); setQuery({ ...defaults }) }
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold">Ticket Management</h1><p className="mt-2 text-slate-600">View all support tickets and inspect their details.</p></header>
    <div className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="min-w-0 text-sm font-medium">Search<input className={input} type="search" maxLength={200} placeholder="Search tickets..." aria-describedby="admin-ticket-search-help" value={search} onChange={event => setSearch(event.target.value)} /><span id="admin-ticket-search-help" className="text-xs text-slate-500">Ticket number, title, or description.</span></label>
      <label className="text-sm font-medium">Status<select className={input} value={query.status} onChange={event => change({ status: event.target.value })}><option value="">All statuses</option>{ticketStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
      <LookupFilter label="Priority" load={getTicketPriorities} value={query.priorityId} onChange={value => change({ priorityId: value })} />
      <LookupFilter label="Category" load={getCategories} value={query.categoryId} onChange={value => change({ categoryId: value })} />
      <label className="text-sm font-medium">Assignment<select className={input} value={query.assignment} onChange={event => change({ assignment: event.target.value })}><option value="">All tickets</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={query.sort} onChange={event => change({ sort: event.target.value })}><option value="default">Priority, then oldest (default)</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="priority">Highest priority</option><option value="status">Status</option></select></label>
      <button className={button} disabled={!search && !filtered && query.sort === 'default'} onClick={reset}>Clear filters</button>
    </div>
    {!current && <p role="status">{result ? 'Updating tickets...' : 'Loading tickets...'}</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>Unable to load tickets.</AuthFeedback><button className={button} onClick={() => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></div>}
    {current?.data && <>
      <p className="text-sm text-slate-600">{current.data.pagination.totalRecords} tickets</p>
      {!current.data.tickets.length ? <div className="space-y-3"><p>{filtered ? 'No tickets match your current filters.' : 'No tickets found.'}</p>{filtered && <button className={button} onClick={reset}>Clear filters</button>}</div> : <ul className="space-y-4">{current.data.tickets.map(ticket => <li key={ticket.id}><Link to={`/admin/tickets/${encodeURIComponent(ticket.id)}`} className="block min-w-0 rounded-2xl border border-slate-200 bg-white p-4 no-underline transition-colors hover:border-teal-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:p-6"><p className="break-all text-sm font-semibold text-teal-800">{ticket.ticketNumber}</p><h2 className="mt-1 break-words text-lg font-semibold">{ticket.title}</h2><AdminTicketMetadata ticket={ticket} /></Link></li>)}</ul>}
      {current.data.pagination.totalPages > 1 && <nav aria-label="Ticket pagination" className="flex flex-wrap items-center gap-3"><button className={button} disabled={!current.data.pagination.hasPrevious} onClick={() => setQuery(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button><p>Page {current.data.pagination.currentPage} of {current.data.pagination.totalPages}</p><button className={button} disabled={!current.data.pagination.hasNext} onClick={() => setQuery(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button></nav>}
    </>}
  </div>
}
function LookupFilter({ label, load, value, onChange }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    load({ signal: controller.signal }).then(data => { if (!controller.signal.aborted) setResult({ attempt, data }) }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }) })
    return () => controller.abort()
  }, [load, attempt])
  const current = result?.attempt === attempt ? result : null
  return <div className="min-w-0"><label className="text-sm font-medium">{label}<select className={input} value={value} disabled={!current?.data} onChange={event => onChange(event.target.value)}><option value="">{!current ? `Loading ${label.toLowerCase()} options...` : `All ${label === 'Priority' ? 'priorities' : 'categories'}`}</option>{current?.data?.map(option => <option key={option.id} value={option.id}>{label === 'Priority' ? formatTicketPriority(option.name) : `${option.name}${option.isActive === false ? ' (Inactive)' : ''}`}</option>)}</select></label>{current?.error && <div className="mt-2 space-y-2"><p role="alert" className="text-sm">Unable to load {label.toLowerCase()} options.</p><button className={button} onClick={() => setAttempt(previous => previous + 1)}>Retry {label.toLowerCase()}</button></div>}</div>
}
