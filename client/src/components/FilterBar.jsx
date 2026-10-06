export default function FilterBar({ as: Element = 'div', className = '', activeCount = 0, children, ...props }) {
  return <Element {...props} className={`filter-bar ${className}`}>{children}{activeCount > 0 && <p className="col-span-full text-xs text-slate-500 dark:text-slate-400">{activeCount} {activeCount === 1 ? 'filter active' : 'filters active'}</p>}</Element>
}

export function ClearFilters({ disabled = false, onClick }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="cursor-pointer min-h-11 w-fit shrink-0 justify-self-start self-end rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:cursor-not-allowed disabled:opacity-50">Clear filters</button>
}
