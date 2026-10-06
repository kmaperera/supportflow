import QueueFilters from './QueueFilters'
import useDebouncedSearch from '../../components/useDebouncedSearch'
import { ticketStatuses } from '../employee/ticketFormatting'
import Pagination from '../../components/Pagination'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getApiErrorMessage } from '../../api/apiError'
import { getMyAssignedTickets } from '../../api/ticketApi'
import TechnicianTicketCards from './TechnicianTicketCards'

const actionClass = 'inline-flex min-h-11 items-center rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:opacity-50'

export default function MyAssignedTicketsPage() {
  const { user } = useAuth()
  return <AssignedTickets key={user?.id} />
}

function AssignedTickets() {
  const [request, setRequest] = useState({ page: 1, attempt: 0 })
  const [result, setResult] = useState(null)
  const [search, setSearch] = useState('')
  useDebouncedSearch(search, request.search, setRequest)
  const filtered = Boolean(request.search || request.status || request.categoryId || request.priorityId)
  function changeFilters(changes) { setRequest(previous => ({ ...previous, ...changes, search: search.trim(), page: 1, attempt: 0 })) }
  function resetFilters() { setSearch(''); setRequest({ page: 1, attempt: 0 }) }
  useEffect(() => {
    const controller = new AbortController()
    getMyAssignedTickets({ ...request, limit: 10, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (request.page > lastPage) { setRequest(previous => previous === request ? { ...previous, page: lastPage } : previous); return }
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(error, 'Unable to load your assigned tickets.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  return <div className="layout-page">
    <PageHeader title="My Assigned Tickets" description="Your active workload: Assigned, In Progress, Waiting for User, and Reopened tickets." />
    <QueueFilters query={request} search={search} setSearch={setSearch} onChange={changeFilters} onSearch={() => changeFilters({})} onReset={resetFilters} statuses={ticketStatuses.filter(status => ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'].includes(status.value))} />
    {!current && <ContentSkeleton initial={!result} variant="cards">{result ? 'Updating assigned tickets...' : 'Loading assigned tickets...'}</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load tickets" message={<>{current.error}</>}>
      <button type="button" className={actionClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button>
    </ErrorState>}
    {current?.data && <>
      <>{filtered && !current.data.tickets.length ? <EmptyState title="No assigned tickets match your current filters." actions={<button type="button" className={`${actionClass} cursor-pointer`} onClick={resetFilters}>Clear filters</button>} /> : <AssignedTicketsList tickets={current.data.tickets} totalRecords={current.data.pagination.totalRecords} />}</>
      <Pagination metadata={current.data.pagination} noun="assigned tickets" label="assigned tickets" disabled={false} onPageChange={page => setRequest(previous => ({ ...previous, page }))} />
    </>}
  </div>
}

export function AssignedTicketsList({ tickets, totalRecords }) {
  if (!tickets.length) return <EmptyState title={totalRecords === 0 ? "You don't have any assigned tickets right now." : 'No assigned tickets on this page.'} actions={<Link to="/technician/tickets/unassigned" className={actionClass}>View Unassigned Queue</Link>} />
  return <TechnicianTicketCards tickets={tickets} />
}
