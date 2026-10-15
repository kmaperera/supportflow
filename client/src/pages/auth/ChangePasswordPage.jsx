import { useState } from 'react'
import ThemeToggle from '../../theme/ThemeToggle'
import LogoutButton from '../../auth/LogoutButton'
import ChangePasswordForm from '../../auth/ChangePasswordForm'

export default function ChangePasswordPage() {
  const [busy, setBusy] = useState(false)
  return (
    <main id="main-content" tabIndex={-1} className="auth-ui flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-5 py-10">
      <section aria-labelledby="password-change-heading" className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-9">
        <header className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-teal-700 dark:text-teal-300">SupportFlow</p><ThemeToggle /></header>
        <h1 id="password-change-heading" className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Change your password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Your account requires a new password before you can continue.</p>
        <ChangePasswordForm onSubmittingChange={setBusy} />
        <LogoutButton disabled={busy} />
      </section>
    </main>
  )
}
