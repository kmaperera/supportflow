// Use inside a dl; the label/value semantics remain shared across role dashboards.
export default function SummaryCard({ label, value, highlighted = false }) {
  return <div className={`min-w-0 rounded-2xl border p-4 sm:p-6 ${highlighted ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}>
    <dt className="text-sm font-medium text-slate-600">{label}</dt>
    <dd className="mt-2 text-3xl font-semibold tabular-nums">{value}</dd>
  </div>
}
