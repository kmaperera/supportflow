// Use inside a dl; the label/value semantics remain shared across role dashboards.
export default function SummaryCard({ label, value, highlighted = false }) {
  return <div className={`flex h-full min-w-0 flex-col rounded-2xl border p-4 sm:p-6 ${highlighted ? 'border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
    <dt className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</dt>
    <dd className="mt-auto break-words pt-2 text-3xl font-semibold tabular-nums">{value}</dd>
  </div>
}
