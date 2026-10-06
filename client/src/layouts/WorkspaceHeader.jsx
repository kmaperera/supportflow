export default function WorkspaceHeader({ title, displayName, role }) {
  return <header className="flex min-w-0 flex-col gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
    <p className="min-w-0 font-semibold">{title}</p>
    <div className="min-w-0 sm:max-w-[60%] sm:text-right">
      <p className="break-words text-sm font-medium">{displayName}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{role}</p>
    </div>
  </header>
}
