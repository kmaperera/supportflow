export default function PageHeader({ title, description, actions, titleId }) {
  return <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
    <div className="min-w-0 flex-1 sm:basis-64">
      <h1 id={titleId} className="break-words text-2xl font-semibold">{title}</h1>
      {description && <p className="mt-2 text-slate-600">{description}</p>}
    </div>
    {actions && <div className="layout-actions">{actions}</div>}
  </header>
}
