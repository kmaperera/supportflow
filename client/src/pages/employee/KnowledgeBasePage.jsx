import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPublishedArticles } from '../../api/knowledgeBaseApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from './ticketFormatting'

const buttonClass = 'rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'
export default function KnowledgeBasePage() {
  const [search, setSearch] = useState('')
  const [request, setRequest] = useState({ page: 1, search: '', attempt: 0 })
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getPublishedArticles({ ...request, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(error, 'Unable to load Knowledge Base articles.') })
    })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  function reset() { setSearch(''); setRequest({ page: 1, search: '', attempt: 0 }) }
  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">Knowledge Base</h1>
    <p className="text-slate-600">Find helpful guides and answers for common support issues.</p>
    <form onSubmit={event => { event.preventDefault(); setRequest({ page: 1, search: search.trim(), attempt: request.attempt + 1 }) }} className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 basis-full sm:flex-1 text-sm font-semibold">Search articles<input type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700" placeholder="Search titles and content..." /></label>
      <button type="submit" className={buttonClass}>Search</button>
      {(search || request.search) && <button type="button" className={buttonClass} onClick={reset}>Clear filters</button>}
    </form>
    {!current && <p role="status">Loading articles...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>{current.error}</AuthFeedback><button type="button" className={buttonClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></div>}
    {current?.data && <>
      {!current.data.articles.length ? <p className="rounded-xl border border-slate-200 bg-white p-6">{request.search ? 'No articles match your search.' : 'No Knowledge Base articles are available yet.'}</p> : <ul className="grid gap-4 md:grid-cols-2">
        {current.data.articles.map(article => <li key={article.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="break-words text-lg font-semibold"><Link to={`/employee/knowledge-base/${encodeURIComponent(article.id)}`} className="rounded text-teal-800 underline underline-offset-4 focus-visible:outline-2">{article.title}</Link></h2>
          <p className="mt-3 break-words text-sm text-slate-600">{article.categoryName}</p>
          <p className="mt-2 text-xs text-slate-500">Published {formatTicketDate(article.publishedAt)}</p>
        </li>)}
      </ul>}
      {current.data.pagination.totalPages > 1 && <nav aria-label="Article pagination" className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClass} disabled={!current.data.pagination.hasPrevious} onClick={() => setRequest({ ...request, page: request.page - 1 })}>Previous</button>
        <p className="text-sm">Page {current.data.pagination.currentPage} of {current.data.pagination.totalPages}</p>
        <button type="button" className={buttonClass} disabled={!current.data.pagination.hasNext} onClick={() => setRequest({ ...request, page: request.page + 1 })}>Next</button>
      </nav>}
    </>}
    <Link to="/employee/tickets/new" className="inline-block rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2">Still need help? Create Ticket</Link>
  </div>
}
