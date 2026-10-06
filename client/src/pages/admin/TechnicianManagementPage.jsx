import { ActiveBadge } from '../../components/Badges'
import FilterBar, { ClearFilters } from '../../components/FilterBar'
import useDebouncedSearch from '../../components/useDebouncedSearch'
import Pagination from '../../components/Pagination'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import LoadingState from '../../components/LoadingState'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTechnicianWorkloads, getUsers } from '../../api/userApi'

const button = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400'
const defaults = { page: 1, search: '', isActive: '', sort: 'name', attempt: 0 }
const sorts = { name: ['first_name', 'ASC'], newest: ['created_at', 'DESC'] }

export default function TechnicianManagementPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState(defaults)
  const [result, setResult] = useState(null)
  const [workload, setWorkload] = useState(null)
  const [workloadAttempt, setWorkloadAttempt] = useState(0)
  useDebouncedSearch(search, query.search, setQuery)
  useEffect(() => {
    const controller = new AbortController()
    const [sortBy, order] = sorts[query.sort]
    getUsers({ ...query, role: 'TECHNICIAN', sortBy, order, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (query.page > lastPage) { setQuery(previous => previous === query ? { ...previous, page: lastPage } : previous); return }
      setResult({ query, data })
    }).catch(() => { if (!controller.signal.aborted) setResult({ query, error: true }) })
    return () => controller.abort()
  }, [query])
  useEffect(() => {
    const controller = new AbortController()
    getTechnicianWorkloads({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setWorkload({ data, attempt: workloadAttempt })
    }).catch(() => { if (!controller.signal.aborted) setWorkload({ error: true, attempt: workloadAttempt }) })
    return () => controller.abort()
  }, [workloadAttempt])
  const current = result?.query === query ? result : null
  const counts = workload?.attempt === workloadAttempt ? workload : null
  const byId = new Map(counts?.data?.map(user => [String(user.id), user.workload.totalActive]))
  const filtered = Boolean(query.search || query.isActive)
  function change(values) { setQuery(previous => ({ ...previous, ...values, search: search.trim(), page: 1 })) }
  function reset() { setSearch(''); setQuery({ ...defaults }) }
  return <div className="layout-page">
    <PageHeader title="Technician Management" description="View technician accounts and current active ticket counts." actions={<><div className="layout-actions"><Link className={button} to="/admin/technicians/workload">View Workload</Link><Link className={`${button} shrink-0 hover:bg-teal-50 dark:hover:bg-teal-950`} to="/admin/users">Manage user accounts</Link></div></>} />
    <section aria-label="Technician summary" className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {current?.data && <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"><p className="text-sm font-medium text-slate-600 dark:text-slate-300">{filtered ? 'Matching technicians' : 'Total technicians'}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{current.data.pagination.totalRecords}</p></div>}
      {counts?.data && <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"><p className="text-sm font-medium text-slate-600 dark:text-slate-300">Active tickets assigned to active technicians</p><p className="mt-2 text-2xl font-semibold tabular-nums">{counts.data.reduce((total, user) => total + user.workload.totalActive, 0)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Across all active technicians, independent of list filters.</p></div>}
    </section>
    {!counts && <LoadingState>Loading workload counts...</LoadingState>}
    {counts?.error && <ErrorState compact title="Unable to load workload counts." message="Technician accounts are still available."><button className={button} onClick={() => setWorkloadAttempt(value => value + 1)}>Retry workload</button></ErrorState>}
    <FilterBar activeCount={[query.search, query.isActive, query.sort !== 'name'].filter(Boolean).length} className="grid gap-4 layout-panel sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
      <label className="min-w-0 text-sm font-medium sm:col-span-2 lg:col-span-1">Search<input className={input} type="search" aria-describedby="technician-search-help" placeholder="Search technicians..." value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="text-sm font-medium">Status<select className={input} value={query.isActive} onChange={event => change({ isActive: event.target.value })}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={query.sort} onChange={event => change({ sort: event.target.value })}><option value="name">First name: A–Z</option><option value="newest">Newest first</option></select></label>
      <ClearFilters disabled={!search && !query.search && !query.isActive && query.sort === defaults.sort} onClick={reset} />
      <p id="technician-search-help" className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2 lg:col-span-4">Search by first name, last name, or email.</p>
    </FilterBar>
    {!current && <ContentSkeleton initial={!result} variant="cards" columns="xl:grid-cols-2">{result ? 'Updating technicians...' : 'Loading technicians...'}</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load technicians."><button className={button} onClick={() => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></ErrorState>}
    {current?.data && <>
      {!current.data.users.length ? <EmptyState title={filtered ? 'No technicians match your current filters.' : 'No technicians found.'} actions={filtered ? <ClearFilters onClick={reset} /> : <Link className={button} to="/admin/users">Manage User Accounts</Link>} /> : <ul className="grid min-w-0 gap-4 xl:grid-cols-2">{current.data.users.map(user => <li key={user.id} className="min-w-0 layout-panel">
        <h2 className="break-words text-lg font-semibold">{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Name unavailable'}</h2>
        <dl className="mt-3 grid min-w-0 gap-4 text-sm sm:grid-cols-2">{[['Email', user.email], ['Status', <ActiveBadge key="status" value={user.isActive} />], ['Department', user.department || 'Not provided'], ['Active tickets', !user.isActive ? 'Unavailable for inactive technicians' : byId.has(String(user.id)) ? byId.get(String(user.id)) : counts ? 'Unavailable' : 'Loading workload...']].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
      </li>)}</ul>}
      <Pagination metadata={current.data.pagination} noun="technicians" label="technicians" disabled={false} onPageChange={page => setQuery(previous => ({ ...previous, page }))} />
    </>}
  </div>
}
