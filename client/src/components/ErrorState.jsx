import { useRef, useState } from 'react'

/** Query failures stay within their page/section; mutation feedback stays inline. */
export default function ErrorState({ title = 'Unable to load data', message, children, onRetry, compact = false, className = '' }) {
  const pending = useRef(false)
  const [retrying, setRetrying] = useState(false)
  async function retry() {
    if (pending.current) return
    pending.current = true
    setRetrying(true)
    try { await onRetry() } finally { pending.current = false; setRetrying(false) }
  }
  return <div className={`${compact ? 'min-w-0 rounded-xl border border-red-200 p-4' : 'layout-panel'} space-y-3 ${className}`}>
    <div role="alert" aria-atomic="true" className="min-w-0 space-y-1 break-words">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
    {(children || onRetry) && <div className="layout-actions">
      {onRetry && <button type="button" disabled={retrying} onClick={retry} className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{retrying ? 'Retrying...' : 'Retry'}</button>}
      {retrying && <span role="status" className="sr-only">Retrying request...</span>}
      {children}
    </div>}
  </div>
}
