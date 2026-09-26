import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTechnicianWorkloads, getUsers } from '../../api/userApi'
import AuthFeedback from '../../auth/AuthFeedback'

const button = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-700'
const defaults = { page: 1, search: '', isActive: '', sort: 'name', attempt: 0 }
const sorts = { name: ['first_name', 'ASC'], newest: ['created_at', 'DESC'] }

export default function TechnicianManagementPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState(defaults)
  const [result, setResult] = useState(null)
  const [workload, setWorkload] = useState(null)
  const [workloadAttempt, setWorkloadAttempt] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(previous => previous.search === search.trim() ? previous : { ...previous, search: search.trim(), page: 1 }), 500)
    return () => clearTimeout(timer)
  }, [search])
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
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold">Technician Management</h1><p className="mt-2 text-slate-600">View technician accounts and current active ticket counts.</p><Link className={`${button} mt-3`} to="/admin/users">Manage user accounts</Link></header>
    <section aria-label="Technician summary" className="grid gap-4 sm:grid-cols-2">
      {current?.data && <div className="rounded-2xl border border-slate-200 bg-white p-4"><p>{filtered ? 'Matching technicians' : 'Total technicians'}</p><p className="text-2xl font-semibold">{current.data.pagination.totalRecords}</p></div>}
      {counts?.data && <div className="rounded-2xl border border-slate-200 bg-white p-4"><p>Active tickets assigned to active technicians</p><p className="text-2xl font-semibold">{counts.data.reduce((total, user) => total + user.workload.totalActive, 0)}</p><p className="text-sm text-slate-600">Across all active technicians, independent of list filters.</p></div>}
    </section>
    {!counts && <p role="status">Loading workload counts...</p>}
    {counts?.error && <div className="space-y-2"><AuthFeedback>Unable to load workload counts. Technician accounts are still available.</AuthFeedback><button className={button} onClick={() => setWorkloadAttempt(value => value + 1)}>Retry workload</button></div>}
    <div className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
      <label className="min-w-0 text-sm font-medium">Search<input className={input} type="search" placeholder="Search technicians..." value={search} onChange={event => setSearch(event.target.value)} /><span className="text-xs text-slate-500">First name, last name, or email.</span></label>
      <label className="text-sm font-medium">Status<select className={input} value={query.isActive} onChange={event => change({ isActive: event.target.value })}><option value="">All technicians</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={query.sort} onChange={event => change({ sort: event.target.value })}><option value="name">First name</option><option value="newest">Newest</option></select></label>
      <button className={button} onClick={reset}>Clear filters</button>
    </div>
    {!current && <p role="status">Loading technicians...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>Unable to load technicians.</AuthFeedback><button className={button} onClick={() => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></div>}
    {current?.data && <>
      {!current.data.users.length ? <p>{filtered ? 'No technicians match your current filters.' : 'No technicians found.'}</p> : <ul className="grid min-w-0 gap-4 lg:grid-cols-2">{current.data.users.map(user => <li key={user.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="break-words text-lg font-semibold">{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Name unavailable'}</h2>
        <dl className="mt-3 grid min-w-0 gap-4 text-sm sm:grid-cols-2">{[['Email', user.email], ['Status', user.isActive ? 'Active' : 'Inactive'], ['Department', user.department || 'Not provided'], ['Active tickets', !user.isActive ? 'Unavailable for inactive technicians' : byId.has(String(user.id)) ? byId.get(String(user.id)) : counts ? 'Unavailable' : 'Loading...']].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
      </li>)}</ul>}
      {current.data.pagination.totalPages > 1 && <nav aria-label="Technician pagination" className="flex flex-wrap items-center gap-3"><button className={button} disabled={!current.data.pagination.hasPrevious} onClick={() => setQuery(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button><p>Page {current.data.pagination.currentPage} of {current.data.pagination.totalPages}</p><button className={button} disabled={!current.data.pagination.hasNext} onClick={() => setQuery(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button></nav>}
    </>}
  </div>
}
