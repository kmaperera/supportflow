import { ActiveBadge } from '../../components/Badges'
import FilterBar, { ClearFilters } from '../../components/FilterBar'
import useDebouncedSearch from '../../components/useDebouncedSearch'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import AuthFeedback from '../../auth/AuthFeedback'
import { changeUserRole, getUsers, updateUserStatus } from '../../api/userApi'
import { getApiErrorMessage } from '../../api/apiError'
import { formatTicketDate } from '../employee/ticketFormatting'

const roles = { EMPLOYEE: 'Employee', TECHNICIAN: 'Technician', ADMIN: 'Admin' }
const sorts = { newest: ['created_at', 'DESC'], oldest: ['created_at', 'ASC'], name: ['first_name', 'ASC'], role: ['role', 'ASC'] }
const defaults = { page: 1, search: '', role: '', isActive: '', sort: 'newest', attempt: 0 }
const button = 'min-h-11 cursor-pointer rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400'

export default function UserManagementPage() {
  const { user } = useAuth()
  return <UserList key={user?.id} currentAdminId={user?.id} />
}

function UserList({ currentAdminId }) {
  const [confirming, setConfirming] = useState(null)
  const [roleEditor, setRoleEditor] = useState(null)
  const [pending, setPending] = useState({})
  const [feedback, setFeedback] = useState(null)
  const inFlight = useRef(new Set())
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const location = useLocation()
  const navigate = useNavigate()
  const [created] = useState(location.state?.userCreated === true)
  useEffect(() => {
    if (location.state?.userCreated === true) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState(defaults)
  const [result, setResult] = useState(null)
  async function saveRole(user) {
    const id = String(user.id)
    const role = roleEditor?.role
    if (inFlight.current.has(id) || id === String(currentAdminId) || roleEditor?.id !== id || !roleEditor.confirm || !Object.hasOwn(roles, role) || role === user.role) return
    inFlight.current.add(id)
    setPending(previous => ({ ...previous, [id]: 'role' }))
    setFeedback(null)
    try {
      await changeUserRole(user.id, role)
      if (!mounted.current) return
      setRoleEditor(previous => previous?.id === id ? null : previous)
      setFeedback({ success: true, message: 'User role updated successfully.' })
      setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))
    } catch (error) {
      if (!mounted.current) return
      const message = error?.response?.data?.message
      const safe = error?.response?.status === 400 && ['You cannot change your own role', 'Invalid role'].includes(message)
        ? message : error?.response?.status === 404 ? 'User not found.' : getApiErrorMessage(error, 'Unable to change user role. Please try again.')
      setFeedback({ success: false, message: safe })
    } finally {
      inFlight.current.delete(id)
      if (mounted.current) setPending(previous => ({ ...previous, [id]: false }))
    }
  }
  async function changeStatus(user) {
    const id = String(user.id)
    if (inFlight.current.has(id) || (user.isActive && id === String(currentAdminId))) return
    inFlight.current.add(id)
    setPending(previous => ({ ...previous, [id]: true }))
    setFeedback(null)
    try {
      const updated = await updateUserStatus(user.id, !user.isActive)
      if (!mounted.current) return
      setConfirming(null)
      setFeedback({ success: true, message: updated.isActive ? 'User activated successfully.' : 'User deactivated successfully.' })
      setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))
    } catch (error) {
      if (!mounted.current) return
      const message = error?.response?.data?.message
      const safe = error?.response?.status === 400 && message === 'You cannot deactivate your own account'
        ? message
        : error?.response?.status === 404 ? 'User not found.' : getApiErrorMessage(error, 'Unable to update user status. Please try again.')
      setFeedback({ success: false, message: safe })
    } finally {
      inFlight.current.delete(id)
      if (mounted.current) {
        setPending(previous => ({ ...previous, [id]: false }))
      }
    }
  }
  useDebouncedSearch(search, query.search, setQuery)
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
  return <div className="layout-page">
    <PageHeader title="User Management" description="View user accounts, roles, and account status." actions={<><Link to="/admin/users/new" className={`${button} inline-flex items-center`}>Create User</Link></>} />
    {created && <AuthFeedback variant="success">User created successfully.</AuthFeedback>}
    {feedback && <AuthFeedback variant={feedback.success ? 'success' : 'error'}>{feedback.message}</AuthFeedback>}
    <FilterBar activeCount={[query.search, query.role, query.isActive, query.sort !== 'newest'].filter(Boolean).length} className="grid gap-4 layout-panel sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-sm font-medium">Search<input type="search" className={input} placeholder="Search users..." value={search} onChange={event => setSearch(event.target.value)} aria-describedby="user-search-help" /><span id="user-search-help" className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Search first name, last name, or email.</span></label>
      <label className="text-sm font-medium">Role<select className={input} value={query.role} onChange={event => change({ role: event.target.value })}><option value="">All roles</option>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-medium">Status<select className={input} value={query.isActive} onChange={event => change({ isActive: event.target.value })}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={query.sort} onChange={event => change({ sort: event.target.value })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">First name: A–Z</option><option value="role">Role</option></select></label>
      <ClearFilters disabled={!filtered && !search && query.sort === 'newest'} onClick={reset} />
    </FilterBar>
    {!current && <ContentSkeleton initial={!result} variant="cards" columns="xl:grid-cols-2">{result ? 'Updating users...' : 'Loading users...'}</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load users."><button type="button" className={button} onClick={() => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></ErrorState>}
    {current?.data && <>
      {!current.data.users.length ? <EmptyState title={filtered ? 'No users match your current search or filters.' : 'No users found.'} actions={filtered ? <ClearFilters onClick={reset} /> : <Link className={button} to="/admin/users/new">Create User</Link>} /> : <ul className="grid min-w-0 gap-4 xl:grid-cols-2">{current.data.users.map(user => <li key={user.id} className="min-w-0 layout-panel">
        <h2 className="break-words text-lg font-semibold">{[user.firstName, user.lastName].filter(value => typeof value === 'string' && value.trim()).join(' ') || 'Name unavailable'}</h2>
        <dl className="mt-3 grid min-w-0 gap-4 text-sm sm:grid-cols-2">{[['Email', user.email], ['Role', roles[user.role] || 'Unknown role'], ['Status', <ActiveBadge key="status" value={user.isActive} />], ['Created', formatTicketDate(user.createdAt)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
        {user.mustChangePassword === true && <p className="mt-4 text-sm font-medium">Password change required</p>}
        <div className="mt-4 space-y-3">
          {String(user.id) === String(currentAdminId) ? <p className="text-sm text-slate-600 dark:text-slate-300">You cannot change your own role.</p> : roleEditor?.id === String(user.id) ? <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <label className="block text-sm font-medium">New role<select className={input} value={roleEditor.role} disabled={Boolean(pending[user.id]) || roleEditor.confirm} onChange={event => setRoleEditor(previous => ({ ...previous, role: event.target.value, confirm: false }))}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <ConfirmDialog open={roleEditor.confirm} title="Change user role?" description={`User: ${user.email}. Current role: ${user.role}. New role: ${roleEditor.role}. This changes their application permissions.`} variant="warning" confirmLabel="Change Role" pending={Boolean(pending[user.id])} pendingLabel="Updating role..." onConfirm={() => saveRole(user)} onCancel={() => setRoleEditor(previous => ({ ...previous, confirm: false }))}>{feedback && !feedback.success && <AuthFeedback>{feedback.message}</AuthFeedback>}</ConfirmDialog>
            <div className="layout-actions"><button type="button" className={button} disabled={Boolean(pending[user.id]) || !Object.hasOwn(roles, roleEditor.role) || roleEditor.role === user.role} onClick={() => { if (!Object.hasOwn(roles, roleEditor.role) || roleEditor.role === user.role) return; setFeedback(null); setRoleEditor(previous => ({ ...previous, confirm: true })) }}>{pending[user.id] === 'role' ? 'Updating role...' : roleEditor.confirm ? 'Confirm role change' : 'Update Role'}</button><button type="button" className={button} disabled={Boolean(pending[user.id])} onClick={() => setRoleEditor(null)}>Cancel</button></div>
          </div> : <button type="button" className={button} disabled={Boolean(pending[user.id])} onClick={() => { setConfirming(null); setRoleEditor({ id: String(user.id), role: user.role, confirm: false }) }}>Change Role</button>}
          {user.isActive && String(user.id) === String(currentAdminId) ? <p className="text-sm text-slate-600 dark:text-slate-300">You cannot deactivate your own account.</p> : <button type="button" className={`${button} ${user.isActive ? 'border-red-700 dark:border-red-400 text-red-700 dark:text-red-300' : ''}`} disabled={pending[user.id]} onClick={() => user.isActive ? (setFeedback(null), setConfirming(String(user.id))) : changeStatus(user)}>{pending[user.id] === true ? (user.isActive ? 'Deactivating...' : 'Activating...') : user.isActive ? 'Deactivate' : 'Activate'}</button>}
          <ConfirmDialog open={confirming === String(user.id)} title="Deactivate user?" description={`${user.email} will no longer be able to sign in until reactivated.`} variant="destructive" confirmLabel="Deactivate User" pending={Boolean(pending[user.id])} pendingLabel="Deactivating..." onConfirm={() => changeStatus(user)} onCancel={() => setConfirming(null)}>{feedback && !feedback.success && <AuthFeedback>{feedback.message}</AuthFeedback>}</ConfirmDialog>
        </div>
      </li>)}</ul>}
      <Pagination metadata={current.data.pagination} noun="users" label="users" disabled={Object.values(pending).some(Boolean)} onPageChange={page => setQuery(previous => ({ ...previous, page }))} />
    </>}
  </div>
}
