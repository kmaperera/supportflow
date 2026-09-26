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
      setAttempt(value => value + 1)
    } catch (error) { if (mounted.current) setFeedback({ success: false, message: categoryError(error) }) }
    finally {
      inFlight.current.delete(id)
      if (mounted.current) { setPending(previous => ({ ...previous, [id]: false })); setConfirming(previous => previous === id ? null : previous) }
    }
  }
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Category Management</h1><p className="mt-2 text-slate-600">Manage ticket categories used when creating support tickets.</p></div><Link className={button} to="/admin/categories/new">Add Category</Link></header>
    {feedback && <AuthFeedback variant={feedback.success ? 'success' : 'error'}>{feedback.message}</AuthFeedback>}
    <div className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
      <label className="min-w-0 text-sm font-medium sm:col-span-2 lg:col-span-1">Search<input className={input} type="search" placeholder="Search categories..." value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="text-sm font-medium">Status<select className={input} value={status} onChange={event => setStatus(event.target.value)}><option value="">All categories</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label className="text-sm font-medium">Sort by<select className={input} value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name</option><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label>
      <button className="min-h-11 w-fit cursor-pointer self-end rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!search && !status && sort === 'name'} onClick={() => { setSearch(''); setStatus(''); setSort('name') }}>Clear filters</button>
    </div>
    {!current && <p role="status">Loading categories...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>Unable to load categories.</AuthFeedback><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {current?.data && (!categories.length ? <p>{filtered ? 'No categories match your current filters.' : 'No categories found.'}</p> : <ul className="grid min-w-0 gap-4 lg:grid-cols-2">{categories.map(category => <li key={category.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div><h2 className="break-words text-lg font-semibold">{category.name}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{category.description || 'No description provided.'}</p></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">{[['Status', category.isActive ? 'Active' : 'Inactive'], ['Created', formatTicketDate(category.createdAt)], ['Updated', formatTicketDate(category.updatedAt)]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-3">{!pending[category.id] && <Link className={button} to={`/admin/categories/${category.id}/edit`}>Edit</Link>}{confirming !== String(category.id) && <button className={button} disabled={pending[category.id]} onClick={() => category.isActive ? setConfirming(String(category.id)) : changeStatus(category)}>{pending[category.id] ? category.isActive ? 'Deactivating...' : 'Activating...' : category.isActive ? 'Deactivate' : 'Activate'}</button>}</div>
      {confirming === String(category.id) && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3"><p className="font-medium">Deactivate this category?</p><p className="text-sm">It will no longer be available when creating new tickets. Existing tickets will keep their category.</p><div className="flex flex-wrap gap-3"><button className={button} disabled={pending[category.id]} onClick={() => setConfirming(null)}>Cancel</button><button className={button} disabled={pending[category.id]} onClick={() => changeStatus(category)}>{pending[category.id] ? 'Deactivating...' : 'Deactivate'}</button></div></div>}
    </li>)}</ul>)}
  </div>
}
