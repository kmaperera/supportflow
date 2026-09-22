import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { getUsers } from '../../api/userApi'
import { formatTicketDate } from '../employee/ticketFormatting'

const roles = { EMPLOYEE: 'Employee', TECHNICIAN: 'Technician', ADMIN: 'Admin' }
const sorts = { newest: ['created_at', 'DESC'], oldest: ['created_at', 'ASC'], name: ['first_name', 'ASC'], role: ['role', 'ASC'] }
const defaults = { page: 1, search: '', role: '', isActive: '', sort: 'newest', attempt: 0 }
const button = 'min-h-11 cursor-pointer rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-700'

export default function UserManagementPage() {
  const { user } = useAuth()
  return <UserList key={user?.id} />
}

function UserList() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState(defaults)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(previous => previous.search === search.trim() ? previous : { ...previous, search: search.trim(), page: 1 }), 500)
    return () => clearTimeout(timeout)
  }, [search])
  useEffect(() => {
    const controller = new AbortController()
    const [sortBy, order] = sorts[query.sort]
    getUsers({ ...query, sortBy, order, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (query.page > lastPage) { setQuery(previous => previous === query ? { ...previous, page: lastPage } : previous); return }
      setResult({ query, data })
    }).catch(() => { if (!controller.signal.aborted) setResult({ query, error: true }) })
    return () => controller.abort()
  }, [query])
  const current = result?.query === query ? result : null
  const filtered = Boolean(query.search || query.role || query.isActive)
  function change(values) { setQuery(previous => ({ ...previous, ...values, search: search.trim(), page: 1 })) }
  function reset() { setSearch(''); setQuery({ ...defaults }) }
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold">User Management</h1><p className="mt-2 text-slate-600">View user accounts, roles, and account status.</p></header>
    <div className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-sm font-medium">Search<input type="search" className={input} placeholder="Search users..." value={search} onChange={event => setSearch(event.target.value)} aria-describedby="user-search-help" /><span id="user-search-help" className="mt-1 block text-xs text-slate-500">Search first name, last name, or email.</span></label>
      <label className="text-sm font-medium">Role<select className={input} value={query.role} onChange={event => change({ role: event.target.value })}><option value="">All roles</option>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-medium">Status<select className={input} value={query.isActive} onChange={event => change({ isActive: event.target.value })}><option value="">All users</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={query.sort} onChange={event => change({ sort: event.target.value })}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">First name</option><option value="role">Role</option></select></label>
      {(filtered || search || query.sort !== 'newest') && <div><button type="button" className={button} onClick={reset}>Clear filters</button></div>}
    </div>
    {!current && <p role="status">Loading users...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>Unable to load users.</AuthFeedback><button type="button" className={button} onClick={() => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></div>}
    {current?.data && <>
      <p className="text-sm text-slate-600">{current.data.pagination.totalRecords} users</p>
      {!current.data.users.length ? <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6"><p>{filtered ? 'No users match your current search or filters.' : 'No users found.'}</p>{filtered && <button type="button" className={button} onClick={reset}>Clear filters</button>}</section> : <ul className="grid min-w-0 gap-4 lg:grid-cols-2">{current.data.users.map(user => <li key={user.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="break-words text-lg font-semibold">{[user.firstName, user.lastName].filter(value => typeof value === 'string' && value.trim()).join(' ') || 'Name unavailable'}</h2>
        <dl className="mt-3 grid min-w-0 gap-4 text-sm sm:grid-cols-2">{[['Email', user.email], ['Role', roles[user.role] || 'Unknown role'], ['Status', user.isActive ? 'Active' : 'Inactive'], ['Created', formatTicketDate(user.createdAt)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
        {user.mustChangePassword === true && <p className="mt-4 text-sm font-medium">Password change required</p>}
      </li>)}</ul>}
      {current.data.pagination.totalPages > 1 && <nav aria-label="User pagination" className="flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={!current.data.pagination.hasPrevious} onClick={() => setQuery(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button><p>Page {current.data.pagination.currentPage} of {current.data.pagination.totalPages}</p><button type="button" className={button} disabled={!current.data.pagination.hasNext} onClick={() => setQuery(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button></nav>}
    </>}
  </div>
}
