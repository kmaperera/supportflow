import ErrorState from '../../components/ErrorState'
import LoadingState from '../../components/LoadingState'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getKnowledgeBaseArticle } from '../../api/knowledgeBaseApi'
import { getResourceError } from '../../api/apiError'
import { formatTicketDate } from './ticketFormatting'

export default function KnowledgeBaseArticlePage() {
  const { articleId } = useParams()
  const { user } = useAuth()
  return <Article key={`${user?.id}:${articleId}`} articleId={articleId} />
}
function Article({ articleId }) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const pending = useRef(null)
  useEffect(() => {
    let active = true
    // Share the GET during StrictMode effect replay: this endpoint increments views.
    if (!pending.current) pending.current = getKnowledgeBaseArticle(articleId)
    pending.current.then(article => { if (active) setResult({ article }) }).catch(error => {
      if (active) setResult(getResourceError(error, 'Article'))
    })
    return () => { active = false }
  }, [articleId, attempt])
  return <div className="layout-page">
    <Link to="/employee/knowledge-base" className="inline-block rounded text-sm font-semibold text-teal-800 dark:text-teal-300 underline focus-visible:outline-2">Back to Knowledge Base</Link>
    {!result?.article && <h1 className="text-2xl font-semibold">Knowledge Base Article</h1>}
    {!result && <LoadingState>Loading article...</LoadingState>}
    {result?.error && <ErrorState title={result.errorTitle} message={result.error}>{!result.unavailable && <button type="button" onClick={() => { pending.current = null; setResult(null); setAttempt(value => value + 1) }} className="rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm text-teal-800 dark:text-teal-300 focus-visible:outline-2">Retry</button>}</ErrorState>}
    {result?.article && <article className="min-w-0 layout-panel">
      <h1 className="break-words text-2xl font-semibold">{result.article.title}</h1>
      <p className="mt-3 break-words text-sm text-slate-600 dark:text-slate-300">{result.article.categoryName}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Updated {formatTicketDate(result.article.updatedAt)}</p>
      <p className="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800 dark:text-slate-100">{result.article.content}</p>
    </article>}
  </div>
}
