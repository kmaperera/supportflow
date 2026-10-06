import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSuggestedArticles, hasSuggestionInput } from '../../api/knowledgeBaseApi'

export default function SuggestedArticles({ title, description }) {
  const normalizedTitle = title.trim().replace(/\s+/g, ' ')
  const normalizedDescription = description.trim().replace(/\s+/g, ' ')
  const eligible = hasSuggestionInput(normalizedTitle, normalizedDescription)
  const key = JSON.stringify([normalizedTitle, normalizedDescription])
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!eligible) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getSuggestedArticles({ title: normalizedTitle, description: normalizedDescription }, { signal: controller.signal })
        .then(articles => {
          if (!controller.signal.aborted) setResult({ key, articles, failed: false })
        }).catch(() => {
          if (!controller.signal.aborted) setResult({ key, articles: [], failed: true })
        })
    }, 500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [eligible, key, normalizedTitle, normalizedDescription])

  if (!eligible) return null
  const current = result?.key === key ? result : null
  return <section aria-labelledby="suggested-articles-heading" className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4">
    <h2 id="suggested-articles-heading" className="text-lg font-semibold">Suggested Help Articles</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">These articles may help you resolve the issue before submitting a ticket.</p>
    <div role="status" aria-live="polite" className="mt-3 text-sm text-slate-600 dark:text-slate-300">
      {!current ? 'Looking for helpful articles...' : current.failed ? 'Suggestions are temporarily unavailable.' : current.articles.length === 0 ? 'No matching help articles found.' : `${current.articles.length} suggested help articles.`}
    </div>
    {current && !current.failed && current.articles.length > 0 && <ul className="mt-3 space-y-3">
      {current.articles.map(article => <li key={article.id} className="min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <h3 className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100"><Link to={`/employee/knowledge-base/${encodeURIComponent(article.id)}`} target="_blank" rel="noopener noreferrer" className="rounded text-teal-800 dark:text-teal-300 underline focus-visible:outline-2">{article.title}<span className="sr-only"> (opens in a new tab)</span></Link></h3>
        <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">{article.categoryName}</p>
      </li>)}
    </ul>}
  </section>
}
