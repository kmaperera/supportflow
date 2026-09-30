export default function MetadataList({ fields, columns = 'sm:grid-cols-2 xl:grid-cols-3' }) {
  return <dl className={`mt-4 grid min-w-0 gap-4 text-sm ${columns}`}>
    {fields.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>)}
  </dl>
}
