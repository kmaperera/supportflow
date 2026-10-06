import FilterBar, { ClearFilters } from '../../components/FilterBar'
import Pagination from '../../components/Pagination'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPublishedArticles } from '../../api/knowledgeBaseApi'
import { getApiErrorMessage } from '../../api/apiError'
import { formatTicketDate } from './ticketFormatting'

const buttonClass = 'rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'
export default function KnowledgeBasePage() {
  const [search, setSearch] = useState('')
  const [request, setRequest] = useState({ page: 1, search: '', attempt: 0 })
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getPublishedArticles({ ...request, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (request.page > lastPage) { setRequest(previous => previous === request ? { ...previous, page: lastPage } : previous); return }
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(error, 'Unable to load Knowledge Base articles.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  function reset() { setSearch(''); setRequest({ page: 1, search: '', attempt: 0 }) }
  return <div className="layout-page">
    <PageHeader title="Knowledge Base" />
    <p className="text-slate-600 dark:text-slate-300">Find helpful guides and answers for common support issues.</p>
    <FilterBar activeCount={[request.search].filter(Boolean).length} as="form" onSubmit={event => { event.preventDefault(); setRequest({ page: 1, search: search.trim(), attempt: request.attempt + 1 }) }} className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 basis-full sm:flex-1 text-sm font-semibold">Search articles<input type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400" placeholder="Search articles..." /></label>
      <button type="submit" className={buttonClass}>Search</button>
      <ClearFilters disabled={!search && !request.search} onClick={reset} />
    </FilterBar>
    {!current && <ContentSkeleton initial={!result} variant="cards">{result ? 'Updating articles...' : 'Loading articles...'}</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load articles" message={<>{current.error}</>}><button type="button" className={buttonClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></ErrorState>}
    {current?.data && <>
      {!current.data.articles.length ? <EmptyState title={request.search ? 'No articles match your search.' : 'No knowledge base articles are available yet.'} actions={request.search && <ClearFilters onClick={reset} />} /> : <ul className="grid gap-4 md:grid-cols-2">
        {current.data.articles.map(article => <li key={article.id} className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-6">
          <h2 className="break-words text-lg font-semibold"><Link to={`/employee/knowledge-base/${encodeURIComponent(article.id)}`} className="rounded text-teal-800 dark:text-teal-300 underline underline-offset-4 focus-visible:outline-2">{article.title}</Link></h2>
          <p className="mt-3 break-words text-sm text-slate-600 dark:text-slate-300">{article.categoryName}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Published {formatTicketDate(article.publishedAt)}</p>
        </li>)}
      </ul>}
      <Pagination metadata={current.data.pagination} noun="articles" label="articles" disabled={false} onPageChange={page => setRequest(previous => ({ ...previous, page }))} />
    </>}
    <Link to="/employee/tickets/new" className="inline-block rounded text-sm font-semibold text-teal-800 dark:text-teal-300 underline focus-visible:outline-2">Still need help? Create Ticket</Link>
  </div>
}
