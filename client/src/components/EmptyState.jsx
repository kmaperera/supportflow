export default function EmptyState({ title, message, actions, compact = false, titleId }) {
  const Title = compact ? 'p' : 'h2'
  return <div className={`${compact ? 'min-w-0 rounded-xl bg-slate-50 dark:bg-slate-950 p-4' : 'layout-panel'} space-y-3`}>
    <Title id={titleId} className="break-words text-base font-semibold text-slate-900 dark:text-slate-100">{title}</Title>
    {message && <p className="break-words text-sm text-slate-600 dark:text-slate-300">{message}</p>}
    {actions && <div className="layout-actions">{actions}</div>}
  </div>
}
