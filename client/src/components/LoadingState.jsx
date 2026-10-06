export default function LoadingState({ children, className = '', id }) {
  return <p id={id} role="status" aria-live="polite" aria-atomic="true" className={`flex min-h-11 min-w-0 items-center gap-3 text-sm text-slate-600 dark:text-slate-300 ${className}`}>
    <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-teal-700 dark:border-t-teal-300 motion-reduce:animate-none" />
    <span className="min-w-0 break-words">{children}</span>
  </p>
}
