import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import LoadingState from '../../components/LoadingState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { changeArticlePublication, changeKbCategoryStatus, getAdminArticles, getKbCategories } from '../../api/adminKnowledgeBaseApi'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from '../employee/ticketFormatting'
import KbCategoryEditor from './KbCategoryEditor'
import useKbResource from './useKbResource'
import { kbButton as button, kbInput as input, kbCard, kbError, publicationLabel } from './kbPresentation'

const loadCategories = signal => getKbCategories({ signal })
export default function AdminKnowledgeBasePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('articles')
  const [message, setMessage] = useState(location.state?.kbMessage || '')
  const categories = useKbResource(loadCategories)
  useEffect(() => {
    if (location.state?.kbMessage) navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])
  return <div className="layout-page">
    <PageHeader title="Knowledge Base Management" description="Manage help articles and their Knowledge Base categories." />
    <nav aria-label="Knowledge Base sections" className="layout-actions">
      {[['articles', 'KB Articles'], ['categories', 'KB Categories']].map(([value, label]) => <button key={value} type="button" className={`${button} ${tab === value ? 'bg-teal-50 ring-1 ring-teal-700' : ''}`} aria-pressed={tab === value} onClick={() => { setTab(value); setMessage('') }}>{label}</button>)}
    </nav>
    {message && <AuthFeedback variant="success">{message}</AuthFeedback>}
    {tab === 'articles' ? <Articles categories={categories} /> : <Categories resource={categories} />}
  </div>
}
function CategoryLoadNotice({ resource, skeleton = false }) {
  return resource.loading ? skeleton ? <ContentSkeleton initial={!resource.data} columns="xl:grid-cols-2">Loading categories...</ContentSkeleton> : <LoadingState>Loading categories...</LoadingState> : resource.error ? <ErrorState title="Unable to load KB categories."><button className={button} onClick={resource.reload}>Retry categories</button></ErrorState> : null
}
function Articles({ categories }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ page: 1, search: '', categoryId: '' })
  const loader = useCallback(signal => getAdminArticles({ ...query, signal }), [query])
  const resource = useKbResource(loader)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [archive, setArchive] = useState(null)
  const pending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const timer = setTimeout(() => setQuery(previous => previous.search === search.trim() ? previous : { ...previous, search: search.trim(), page: 1 }), 500)
    return () => clearTimeout(timer)
  }, [search])
  const pagination = resource.data?.pagination
  function clear() { setSearch(''); setQuery({ page: 1, search: '', categoryId: '' }) }
  async function publication(article, action) {
    if (pending.current) return
    pending.current = true; setBusy({ id: article.id, action }); setError(''); setMessage('')
    try {
      await changeArticlePublication(article.id, action)
      if (mounted.current) { setMessage(`Article ${({ publish: 'published', unpublish: 'unpublished', archive: 'archived' })[action]} successfully.`); setArchive(null); resource.reload() }
    } catch (cause) {
      if (mounted.current) { setError(kbError(cause, 'Unable to update article publication.')); resource.reload() }
    } finally { pending.current = false; if (mounted.current) setBusy(null) }
  }
  return <section aria-labelledby="kb-articles-heading" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="kb-articles-heading" className="text-xl font-semibold">KB Articles</h2><Link className={button} to="/admin/knowledge-base/articles/new">Add Article</Link></div>
    <div className={kbCard}>
      <div className="grid items-end gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <div><label htmlFor="kb-search" className="text-sm font-semibold">Search articles</label><input id="kb-search" type="search" maxLength={200} className={input} placeholder="Search articles..." value={search} onChange={event => setSearch(event.target.value)} aria-describedby="kb-search-help" /></div>
        <div><label htmlFor="kb-filter-category" className="text-sm font-semibold">KB Category</label><select id="kb-filter-category" className={input} value={query.categoryId} disabled={categories.loading || categories.error} onChange={event => setQuery(previous => ({ ...previous, categoryId: event.target.value, page: 1 }))}><option value="">All categories</option>{categories.data?.map(category => <option key={category.id} value={String(category.id)}>{category.name}{!category.isActive ? ' (inactive)' : ''}</option>)}</select></div>
        <button className={button} onClick={clear} disabled={!search && !query.categoryId}>Clear filters</button>
      </div>
      <p id="kb-search-help" className="text-sm text-slate-500">Search title and content. Newest articles appear first.</p>
      <CategoryLoadNotice resource={categories} />
    </div>
    {error && <AuthFeedback>{error}</AuthFeedback>}{message && <AuthFeedback variant="success">{message}</AuthFeedback>}
    {resource.loading && <ContentSkeleton initial={!resource.data}>{resource.data ? 'Updating articles...' : 'Loading articles...'}</ContentSkeleton>}
    {resource.error && <ErrorState title="Unable to load knowledge base articles."><button className={button} onClick={resource.reload}>Retry</button></ErrorState>}
    {resource.data && <div className="space-y-3" aria-busy={resource.loading}>
      {!resource.loading && !resource.error && !resource.data.articles.length && <EmptyState title={query.search || query.categoryId ? 'No articles match your current filters.' : 'No knowledge base articles found.'} actions={query.search || query.categoryId ? <button type="button" className={button} onClick={clear}>Clear filters</button> : <Link className={button} to="/admin/knowledge-base/articles/new">Add Article</Link>} />}
      {resource.data.articles.map(article => <article key={article.id} className={kbCard}>
        <div><h3 className="text-lg font-semibold break-words">{article.title}</h3><p className="mt-1 text-sm text-slate-600">{article.categoryName} · {publicationLabel(article.status)} · {article.viewCount} views</p></div>
        <p className="text-sm text-slate-500">Created {formatTicketDate(article.createdAt)} · Updated {formatTicketDate(article.updatedAt)}</p>
        <div className="layout-actions">
          <Link className={button} to={`/admin/knowledge-base/articles/${encodeURIComponent(article.id)}/edit`}>Edit<span className="sr-only"> {article.title}</span></Link>
          {article.status !== 'ARCHIVED' && <>
            <button className={button} disabled={Boolean(busy) || resource.loading || resource.error} onClick={() => publication(article, article.status === 'PUBLISHED' ? 'unpublish' : 'publish')}>{busy?.id === article.id && busy.action !== 'archive' ? busy.action === 'publish' ? 'Publishing...' : 'Unpublishing...' : article.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}<span className="sr-only"> {article.title}</span></button>
            <button className={button} disabled={Boolean(busy)} onClick={() => setArchive(article.id)}>Archive<span className="sr-only"> {article.title}</span></button>
          </>}
        </div>
        {archive === article.id && <div className="space-y-3 rounded-lg border border-slate-300 p-3"><p>Archive “{article.title}”? Archived articles cannot be published again.</p><div className="layout-actions"><button className={button} disabled={Boolean(busy)} onClick={() => publication(article, 'archive')}>{busy?.action === 'archive' ? 'Archiving...' : 'Confirm archive'}</button><button className={button} disabled={Boolean(busy)} onClick={() => setArchive(null)}>Cancel</button></div></div>}
      </article>)}
      <div className="flex flex-wrap items-center gap-3"><p className="text-sm">{pagination.totalRecords} articles · Page {pagination.currentPage} of {Math.max(1, pagination.totalPages)}</p><button className={button} disabled={resource.loading || resource.error || !pagination.hasPrevious} onClick={() => setQuery(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button><button className={button} disabled={resource.loading || resource.error || !pagination.hasNext} onClick={() => setQuery(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button></div>
    </div>}
  </section>
}
function Categories({ resource }) {
  const [editor, setEditor] = useState(null)
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function toggle(category) {
    if (pending.current) return
    pending.current = true; setBusy(category.id); setError(''); setMessage('')
    try {
      await changeKbCategoryStatus(category.id, !category.isActive)
      if (mounted.current) { setMessage(`KB category ${category.isActive ? 'deactivated' : 'activated'} successfully.`); resource.reload() }
    } catch (cause) { if (mounted.current) { setError(kbError(cause, 'Unable to update KB category status.')); resource.reload() } }
    finally { pending.current = false; if (mounted.current) setBusy(null) }
  }
  return <section aria-labelledby="kb-categories-heading" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="kb-categories-heading" className="text-xl font-semibold">KB Categories</h2><button className={button} disabled={Boolean(editor) || Boolean(busy)} onClick={() => { setEditor({ category: null }); setMessage('') }}>Add KB Category</button></div>
    <p className="text-sm text-slate-600">Inactive categories remain here for management. Their articles are hidden from employees and technicians until the category is active again.</p>
    {message && <AuthFeedback variant="success">{message}</AuthFeedback>}{error && <AuthFeedback>{error}</AuthFeedback>}
    {editor && <KbCategoryEditor key={editor.category?.id || 'new'} category={editor.category} onCancel={() => setEditor(null)} onSaved={() => { setMessage(editor.category ? 'KB category updated successfully.' : 'KB category created successfully.'); setEditor(null); resource.reload() }} />}
    <CategoryLoadNotice resource={resource} skeleton />
    {!resource.loading && !resource.error && !resource.data?.length && <EmptyState compact title="No knowledge base categories found." />}
    <div className="grid gap-4 xl:grid-cols-2">{resource.data?.map(category => <article key={category.id} className={kbCard}>
      <div><h3 className="text-lg font-semibold">{category.name}</h3><p className="mt-1 text-sm font-medium">{category.isActive ? 'Active' : 'Inactive'}</p></div>
      {category.description && <p className="whitespace-pre-wrap text-sm text-slate-600">{category.description}</p>}
      <div className="layout-actions"><button className={button} disabled={Boolean(editor) || Boolean(busy) || resource.loading || resource.error} onClick={() => { setEditor({ category }); setMessage('') }}>Edit<span className="sr-only"> {category.name}</span></button><button className={button} disabled={Boolean(editor) || Boolean(busy) || resource.loading || resource.error} onClick={() => toggle(category)}>{busy === category.id ? category.isActive ? 'Deactivating...' : 'Activating...' : category.isActive ? 'Deactivate' : 'Activate'}<span className="sr-only"> {category.name}</span></button></div>
    </article>)}</div>
  </section>
}
