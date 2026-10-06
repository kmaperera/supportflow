import LoadingState from './LoadingState'

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700 motion-reduce:animate-none ${className}`} />
}

export function SkeletonCard({ compact = false }) {
  return <div className={compact ? 'min-w-0 space-y-3 rounded-xl bg-slate-50 dark:bg-slate-950 p-4' : 'layout-panel space-y-4'}>
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-5 w-3/4" />
    <Skeleton className="h-4 w-full" />
    {!compact && <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map(key => <Skeleton key={key} className="h-8 w-full" />)}</div>}
  </div>
}

export function SummarySkeleton({ count = 4, columns = 'sm:grid-cols-2 xl:grid-cols-4' }) {
  return <div className={`grid min-w-0 gap-4 ${columns}`}>
    {Array.from({ length: count }, (_, index) => <div key={index} className="layout-panel space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-16" /></div>)}
  </div>
}

export function SkeletonTable({ headers }) {
  return <div className="layout-table rounded-lg border border-slate-200 dark:border-slate-700">
    <table className="w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-950"><tr>{headers.map(header => <th key={header} scope="col" className="whitespace-nowrap p-3">{header}</th>)}</tr></thead>
      <tbody>{[0, 1, 2].map(row => <tr key={row} className="border-t border-slate-200 dark:border-slate-700">{headers.map(header => <td key={header} className="min-w-28 p-3"><Skeleton className="h-5 w-full" /></td>)}</tr>)}</tbody>
    </table>
  </div>
}

// Only the caller knows whether this is an initial load or a background request.
// Keep the existing Phase 17.3 text for subsequent requests.
export default function ContentSkeleton({ initial, children, variant = 'cards', className = '', columns, count = 3, headers }) {
  if (!initial) return <LoadingState className={className}>{children}</LoadingState>
  let content
  if (variant === 'summary') content = <SummarySkeleton count={count} columns={columns} />
  else if (variant === 'dashboard' || variant === 'workload') content = <><SummarySkeleton /><SkeletonCard /><SkeletonCard /></>
  else if (variant === 'detail') content = <><SkeletonCard /><div className="layout-panel space-y-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /></div><SkeletonCard compact /></>
  else if (variant === 'chart') content = <Skeleton className="h-80 w-full" />
  else if (variant === 'table' || variant === 'report') content = <>{variant === 'report' && <SummarySkeleton count={2} columns="sm:grid-cols-2" />}<SkeletonTable headers={headers} /></>
  else content = <div className={`grid min-w-0 gap-4 ${columns || ''}`}>{Array.from({ length: count }, (_, index) => <SkeletonCard key={index} compact={variant === 'rows'} />)}</div>
  return <div className={`min-w-0 space-y-4 ${className}`}>
    <p role="status" aria-live="polite" className="sr-only">{children}</p>
    <div aria-hidden="true" className="min-w-0 space-y-4">{content}</div>
  </div>
}
