export default function AdminPlaceholderPage({ title, phase }) {
  return <section className="min-w-0 layout-panel">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <p className="mt-3 text-slate-600">This section is coming in Phase {phase}.</p>
  </section>
}
