import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getKnowledgeBaseArticle } from '../../api/knowledgeBaseApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
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
      if (active) setResult({ error: [400, 403, 404, 422].includes(error?.response?.status) ? 'This article is not available.' : getApiErrorMessage(error, 'Unable to load this article.') })
    })
    return () => { active = false }
  }, [articleId, attempt])
  return <div className="space-y-5">
    <Link to="/employee/knowledge-base" className="inline-block rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2">Back to Knowledge Base</Link>
    {!result && <p role="status">Loading article...</p>}
    {result?.error && <div className="space-y-3"><AuthFeedback>{result.error}</AuthFeedback><button type="button" onClick={() => { pending.current = null; setResult(null); setAttempt(value => value + 1) }} className="rounded-lg border border-teal-700 px-4 py-2 text-sm text-teal-800 focus-visible:outline-2">Retry</button></div>}
    {result?.article && <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-8">
      <h1 className="break-words text-2xl font-semibold">{result.article.title}</h1>
      <p className="mt-3 break-words text-sm text-slate-600">{result.article.categoryName}</p>
      <p className="mt-2 text-xs text-slate-500">Updated {formatTicketDate(result.article.updatedAt)}</p>
      <p className="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">{result.article.content}</p>
    </article>}
  </div>
}
