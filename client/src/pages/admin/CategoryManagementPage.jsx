import FilterBar, { ClearFilters } from '../../components/FilterBar'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getCategories, updateCategoryStatus } from '../../api/categoryApi'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from '../employee/ticketFormatting'
import { categoryButton as button, categoryInput as input, categoryError } from './categoryPresentation'

export default function CategoryManagementPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState(() => ['created', 'updated'].includes(location.state?.categorySaved) ? { success: true, message: `Category ${location.state.categorySaved} successfully.` } : null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('name')
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [pending, setPending] = useState({})
  const inFlight = useRef(new Set())
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (location.state?.categorySaved) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])
  useEffect(() => {
    const controller = new AbortController()
    getCategories({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ attempt, data })
    }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }) })
    return () => controller.abort()
  }, [attempt])
  const current = result?.attempt === attempt ? result : null
  const filtered = Boolean(search.trim() || status)
  const categories = (current?.data || []).filter(category => category.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (!status || category.isActive === (status === 'active'))).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    return (new Date(a.createdAt) - new Date(b.createdAt)) * (sort === 'newest' ? -1 : 1) || a.name.localeCompare(b.name)
  })
  async function changeStatus(category) {
    const id = String(category.id)
    if (inFlight.current.has(id)) return
    inFlight.current.add(id); setPending(previous => ({ ...previous, [id]: true })); setFeedback(null)
    try {
      const updated = await updateCategoryStatus(category.id, !category.isActive)
      if (!mounted.current) return
      setFeedback({ success: true, message: `Category ${updated.isActive ? 'activated' : 'deactivated'} successfully.` })
      setConfirming(null)
      setAttempt(value => value + 1)
    } catch (error) { if (mounted.current) setFeedback({ success: false, message: categoryError(error) }) }
    finally {
      inFlight.current.delete(id)
      if (mounted.current) { setPending(previous => ({ ...previous, [id]: false })) }
    }
  }
  return <div className="layout-page">
    <PageHeader title="Category Management" description="Manage ticket categories used when creating support tickets." actions={<><Link className={button} to="/admin/categories/new">Add Category</Link></>} />
    {feedback && <AuthFeedback variant={feedback.success ? 'success' : 'error'}>{feedback.message}</AuthFeedback>}
    <FilterBar activeCount={[search.trim(), status, sort !== 'name'].filter(Boolean).length} className="grid gap-4 layout-panel sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
      <label className="min-w-0 text-sm font-medium sm:col-span-2 lg:col-span-1">Search<input className={input} type="search" placeholder="Search categories..." value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="text-sm font-medium">Status<select className={input} value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name: A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      <ClearFilters disabled={!search && !status && sort === 'name'} onClick={() => { setSearch(''); setStatus(''); setSort('name') }} />
    </FilterBar>
    {!current && <ContentSkeleton initial={!result} variant="cards" columns="xl:grid-cols-2">{result ? 'Updating categories...' : 'Loading categories...'}</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load categories."><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry</button></ErrorState>}
    {current?.data && (!categories.length ? <EmptyState title={filtered ? 'No categories match your current filters.' : 'No ticket categories found.'} actions={filtered ? <ClearFilters onClick={() => { setSearch(''); setStatus(''); setSort('name') }} /> : <Link className={button} to="/admin/categories/new">Add Category</Link>} /> : <ul className="grid min-w-0 gap-4 xl:grid-cols-2">{categories.map(category => <li key={category.id} className="min-w-0 space-y-4 layout-panel">
      <div><h2 className="break-words text-lg font-semibold">{category.name}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{category.description || 'No description provided.'}</p></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">{[['Status', category.isActive ? 'Active' : 'Inactive'], ['Created', formatTicketDate(category.createdAt)], ['Updated', formatTicketDate(category.updatedAt)]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="layout-actions">{!pending[category.id] && <Link className={button} to={`/admin/categories/${category.id}/edit`}>Edit</Link>}{<button className={button} disabled={pending[category.id]} onClick={() => category.isActive ? (setFeedback(null), setConfirming(String(category.id))) : changeStatus(category)}>{pending[category.id] ? category.isActive ? 'Deactivating...' : 'Activating...' : category.isActive ? 'Deactivate' : 'Activate'}</button>}</div>
      <ConfirmDialog open={confirming === String(category.id)} title="Deactivate category?" description={`${category.name} will no longer be available for new tickets. Existing tickets will keep their category.`} variant="destructive" confirmLabel="Deactivate Category" pending={Boolean(pending[category.id])} pendingLabel="Deactivating..." onConfirm={() => changeStatus(category)} onCancel={() => setConfirming(null)}>{feedback && !feedback.success && <AuthFeedback>{feedback.message}</AuthFeedback>}</ConfirmDialog>
    </li>)}</ul>)}
  </div>
}
