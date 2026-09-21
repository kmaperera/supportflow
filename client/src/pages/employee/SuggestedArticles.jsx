import { useEffect, useState } from 'react'
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
  return <section aria-labelledby="suggested-articles-heading" className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h2 id="suggested-articles-heading" className="text-lg font-semibold">Suggested Help Articles</h2>
    <p className="mt-1 text-sm text-slate-600">These articles may help you resolve the issue before submitting a ticket.</p>
    <div role="status" aria-live="polite" className="mt-3 text-sm text-slate-600">
      {!current ? 'Looking for helpful articles...' : current.failed ? 'Suggestions are temporarily unavailable.' : current.articles.length === 0 ? 'No matching help articles found.' : `${current.articles.length} suggested help articles.`}
    </div>
    {current && !current.failed && current.articles.length > 0 && <ul className="mt-3 space-y-3">
      {current.articles.map(article => <li key={article.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="break-words text-sm font-semibold text-slate-900">{article.title}</h3>
        <p className="mt-1 break-words text-xs text-slate-600">{article.categoryName}</p>
      </li>)}
    </ul>}
  </section>
}
