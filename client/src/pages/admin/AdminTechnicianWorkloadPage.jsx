import LoadingState from '../../components/LoadingState'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTechnicianWorkloads } from '../../api/userApi'
import AuthFeedback from '../../auth/AuthFeedback'

const button = 'inline-flex min-h-11 w-fit cursor-pointer items-center rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700'
const personName = person => [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Name unavailable'
const fields = [['Active tickets', 'totalActive'], ['Assigned', 'assigned'], ['In Progress', 'inProgress'], ['Waiting for User', 'waitingForUser'], ['Reopened', 'reopened']]

export default function AdminTechnicianWorkloadPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('ascending')
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 500); return () => clearTimeout(timer) }, [search])
  useEffect(() => {
    const controller = new AbortController()
    getTechnicianWorkloads({ search: query, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      if (data.some(person => fields.some(([, key]) => !Number.isSafeInteger(person.workload?.[key]) || person.workload[key] < 0))) throw new Error('Invalid workload counts')
      setResult({ query, attempt, data })
    }).catch(() => { if (!controller.signal.aborted) setResult({ query, attempt, error: true }) })
    return () => controller.abort()
  }, [query, attempt])
  const current = result?.query === query && result?.attempt === attempt ? result : null
  const rows = current?.data?.filter(person => !filter || (filter === 'has' ? person.workload.totalActive > 0 : person.workload.totalActive === 0)).sort((a, b) => (sort === 'name' ? 0 : (a.workload.totalActive - b.workload.totalActive) * (sort === 'descending' ? -1 : 1)) || personName(a).localeCompare(personName(b))) || []
  function reset() { setSearch(''); setQuery(''); setFilter(''); setSort('ascending') }
  return <div className="layout-page">
    <PageHeader title="Technician Workload" description="Current workload for active technicians. Active tickets include Assigned, In Progress, Waiting for User, and Reopened." actions={<><Link className={button} to="/admin/technicians">Technician Management</Link></>} />
    <div className="grid gap-4 layout-panel sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
      <label className="min-w-0 text-sm font-medium">Search<input className={input} type="search" maxLength={100} placeholder="Search technicians..." value={search} onChange={event => setSearch(event.target.value)} aria-describedby="workload-search-help" /></label>
      <label className="text-sm font-medium">Workload<select className={input} value={filter} onChange={event => setFilter(event.target.value)}><option value="">All</option><option value="has">Has active tickets</option><option value="none">No active tickets</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={sort} onChange={event => setSort(event.target.value)}><option value="ascending">Active tickets ascending</option><option value="descending">Active tickets descending</option><option value="name">Name</option></select></label>
      <button className={button} disabled={!search && !query && !filter && sort === 'ascending'} onClick={reset}>Clear filters</button>
      <p id="workload-search-help" className="text-xs text-slate-500 sm:col-span-2 xl:col-span-4">Search first name, last name, email, or department.</p>
    </div>
    {!current && <LoadingState>Loading technician workload...</LoadingState>}
    {current?.error && <div className="space-y-3"><AuthFeedback>Unable to load technician workload.</AuthFeedback><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {current?.data && <>
      <p className="text-sm text-slate-600">{query || filter ? 'Summary for technicians matching the current search and workload filter.' : 'Summary across all active technicians.'} Inactive technicians are not included by this endpoint.</p>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Active technicians', rows.length], ['With active tickets', rows.filter(person => person.workload.totalActive > 0).length], ['No active tickets', rows.filter(person => person.workload.totalActive === 0).length], ['Active assigned tickets', rows.reduce((sum, person) => sum + person.workload.totalActive, 0)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
      {!rows.length ? <p>{query || filter ? 'No technicians match your current filters.' : 'No technicians found.'}</p> : <ul className="grid min-w-0 gap-4 xl:grid-cols-2">{rows.map(person => <li key={person.id} className="min-w-0 layout-panel"><h2 className="break-words text-lg font-semibold">{personName(person)}</h2><p className="mt-1 break-all text-sm text-slate-600">{person.email}</p><p className="mt-1 text-sm">Active</p><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">{fields.map(([label, key]) => <div key={key}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{person.workload[key]}</dd></div>)}</dl></li>)}</ul>}
    </>}
  </div>
}
