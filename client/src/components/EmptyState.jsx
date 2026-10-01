export default function EmptyState({ title, message, actions, compact = false, titleId }) {
  const Title = compact ? 'p' : 'h2'
  return <div className={`${compact ? 'min-w-0 rounded-xl bg-slate-50 p-4' : 'layout-panel'} space-y-3`}>
    <Title id={titleId} className="break-words text-base font-semibold text-slate-900">{title}</Title>
    {message && <p className="break-words text-sm text-slate-600">{message}</p>}
    {actions && <div className="layout-actions">{actions}</div>}
  </div>
}
