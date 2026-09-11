export default function EmployeePlaceholderPage({ title, phase }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm text-slate-600">Coming in Phase {phase}.</p>
    </section>
  )
}
