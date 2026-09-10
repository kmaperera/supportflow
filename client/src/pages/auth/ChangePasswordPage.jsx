export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section aria-labelledby="password-change-heading" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-teal-700">SupportFlow</p>
        <h1 id="password-change-heading" className="text-2xl font-semibold text-slate-900">Password change required</h1>
        <p className="mt-4 leading-7 text-slate-600">You must change your password before continuing.</p>
      </section>
    </main>
  )
}
