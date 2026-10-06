import useDebouncedSearch from '../../components/useDebouncedSearch'
import Pagination from '../../components/Pagination'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getApiErrorMessage } from '../../api/apiError'
import { getUnassignedTickets, selfAssignTicket } from '../../api/ticketApi'
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
  const pending = useRef(new Set())
  const [pendingIds, setPendingIds] = useState([])
  const [notice, setNotice] = useState(null)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useDebouncedSearch(search, request.search, setRequest)
  const changeFilters = changes => setRequest(previous => ({ ...previous, ...changes, search: search.trim(), page: 1, attempt: 0 }))
  function resetFilters() {
    setSearch('')
    setRequest({ page: 1, attempt: 0 })
  }
  const filtered = Boolean(request.search || request.status || request.categoryId || request.priorityId)
  useEffect(() => {
    const controller = new AbortController()
    getUnassignedTickets({ ...request, limit: 10, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (request.page > lastPage) {
        setRequest(previous => previous === request ? { ...previous, page: lastPage } : previous)
        return
      }
      setResult({ request, data })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(error, 'Unable to load the unassigned ticket queue.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  const reload = () => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))
  async function assign(ticket) {
    const key = String(ticket.id)
    if (pending.current.has(key) || ticket.status !== 'OPEN' || ticket.assignedTo !== null) return
    pending.current.add(key)
    setPendingIds([...pending.current])
    setNotice(null)
    try {
      await selfAssignTicket(ticket.id)
      if (!mounted.current) return
      setNotice({ text: `Ticket ${ticket.ticketNumber} assigned to you successfully.` })
      reload()
    } catch (error) {
      if (!mounted.current) return
      const status = error?.response?.status
      const conflict = status === 409
      const message = error?.response?.data?.message
      setNotice({ error: true, text: conflict
        ? message === 'Ticket is already assigned'
          ? 'This ticket has already been assigned. The queue is being refreshed.'
          : 'This ticket can no longer be self-assigned in its current state. The queue is being refreshed.'
        : status === 404 ? 'This ticket is no longer available. The queue is being refreshed.'
          : [400, 422].includes(status) ? 'Unable to assign this ticket. Refresh the queue and try again.'
            : getApiErrorMessage(error, 'Unable to assign this ticket. Please try again.') })
      if (conflict || status === 404) reload()
    } finally {
      pending.current.delete(key)
      if (mounted.current) setPendingIds([...pending.current])
    }
  }
  return <div className="layout-page">
    <PageHeader title="Unassigned Ticket Queue" description="Tickets without a currently assigned technician." actions={<><button type="button" className={actionClass} disabled={!current} onClick={reload}>Refresh</button></>} />
    <QueueFilters query={request} search={search} setSearch={setSearch} onChange={changeFilters} onSearch={() => changeFilters({})} onReset={resetFilters} />
    {notice && <AuthFeedback variant={notice.error ? 'error' : 'success'}>{notice.text}</AuthFeedback>}
    {!current && <ContentSkeleton initial={!result} variant="cards">{result ? 'Updating queue...' : 'Loading unassigned tickets...'}</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load tickets" message={<>{current.error}</>}>
      <button type="button" className={actionClass} onClick={reload}>Retry</button>
    </ErrorState>}
    {current?.data && <>
      <UnassignedTicketsList tickets={current.data.tickets} totalRecords={current.data.pagination.totalRecords} filtered={filtered} onReset={resetFilters} renderAction={ticket => <SelfAssignAction ticket={ticket} pending={pendingIds.includes(String(ticket.id))} onAssign={assign} />} />
      <Pagination metadata={current.data.pagination} noun="unassigned tickets" label="unassigned tickets" disabled={pendingIds.length > 0} onPageChange={page => setRequest(previous => ({ ...previous, page }))} />
    </>}
  </div>
}

export function SelfAssignAction({ ticket, pending, onAssign }) {
  const eligible = ticket.status === 'OPEN' && ticket.assignedTo === null
  return <>
    {!eligible && <p id={`assignment-help-${ticket.id}`} className="text-sm text-slate-600">Only open, unassigned tickets can be self-assigned.</p>}
    <button type="button" disabled={pending || !eligible} aria-label={`${pending ? 'Assigning' : 'Assign to me'}: ${ticket.ticketNumber}`} aria-describedby={!eligible ? `assignment-help-${ticket.id}` : undefined} onClick={() => onAssign(ticket)} className={`${actionClass} w-full cursor-pointer justify-center disabled:cursor-not-allowed sm:w-auto`}>{pending ? 'Assigning...' : 'Assign to me'}</button>
  </>
}

export function UnassignedTicketsList({ tickets, totalRecords, filtered = false, onReset, renderAction }) {
  if (tickets.length) return <TechnicianTicketCards tickets={tickets} renderAction={renderAction} />
  if (filtered) return <EmptyState title="No unassigned tickets match your current search or filters." actions={<button type="button" onClick={onReset} className={actionClass}>Clear filters</button>} />
  return <EmptyState title={totalRecords === 0 ? 'There are no unassigned tickets right now.' : 'No unassigned tickets on this page.'} actions={<Link to="/technician/tickets/assigned" className={actionClass}>View My Assigned Tickets</Link>} />
}
