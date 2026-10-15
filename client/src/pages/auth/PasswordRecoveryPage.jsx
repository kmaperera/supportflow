import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ThemeToggle from '../../theme/ThemeToggle'
import FieldError from '../../components/FieldError'
import AuthFeedback from '../../auth/AuthFeedback'
import { useAuth } from '../../auth/useAuth'
import { forgotPassword, resetPassword } from '../../api/authApi'
import { getApiErrorMessage, getAuthFieldErrors } from '../../api/apiError'
import { validatePasswordChange } from '../../auth/passwordValidation'

const button = 'min-h-11 rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:opacity-60'
const input = 'mt-2 block w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-slate-900 dark:text-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700'
export default function PasswordRecoveryPage({ reset = false }) {
  const [params] = useSearchParams()
  // Never persist a recovery credential outside this page's memory/URL.
  const token = params.get('token') || ''
  return <RecoveryForm key={`${reset}:${token}`} reset={reset} token={token} />
}
function RecoveryForm({ reset, token }) {
  const { clearSession } = useAuth()
  const [values, setValues] = useState({ email: '', newPassword: '', confirmPassword: '' })
  const [visible, setVisible] = useState({})
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const pending = useRef(false), inputs = useRef({})
  const invalidLink = reset && !/^[a-f0-9]{64}$/.test(token)
  const fields = reset ? [['newPassword', 'New password'], ['confirmPassword', 'Confirm new password']] : [['email', 'Email address']]
  async function submit(event) {
    event.preventDefault()
    if (pending.current || invalidLink || success) return
    const next = reset ? validatePasswordChange({ ...values, currentPassword: '' }) : {}
    delete next.currentPassword
    if (reset && values.newPassword.length > 1024) next.newPassword = 'Use at most 1024 characters.'
    if (!reset && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) || values.email.trim().length > 255)) next.email = 'Enter a valid email address.'
    setErrors(next); setError(null)
    const first = fields.find(([key]) => next[key])
    if (first) { inputs.current[first[0]]?.focus(); return }
    pending.current = true; setBusy(true)
    try {
      if (reset) { await resetPassword({ token, newPassword: values.newPassword, confirmPassword: values.confirmPassword }); clearSession() }
      else await forgotPassword(values.email)
      setValues({ email: '', newPassword: '', confirmPassword: '' }); setVisible({}); setSuccess(true)
    } catch (cause) {
      setErrors(getAuthFieldErrors(cause, fields.map(([key]) => key)))
      setError(getApiErrorMessage(cause, reset ? 'Unable to reset your password. Please try again.' : 'Unable to request password reset instructions. Please try again.'))
    } finally { pending.current = false; setBusy(false) }
  }
  return <main id="main-content" className="auth-ui flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-5 text-slate-900 dark:text-slate-100">
    <section className="w-full max-w-lg min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-9" aria-labelledby="recovery-heading">
      <header className="flex items-center justify-between gap-3"><span className="font-semibold text-teal-700 dark:text-teal-300">SupportFlow</span><ThemeToggle /></header>
      <h1 id="recovery-heading" className="mt-5 text-2xl font-semibold">{reset ? 'Reset password' : 'Forgot password'}</h1>
      {invalidLink ? <AuthFeedback>This password reset link is invalid or missing. Request a new link.</AuthFeedback> : success ? <AuthFeedback toast={false} variant="success">{reset ? 'Password reset successfully. Please log in with your new password.' : 'If an account exists for that email, password reset instructions have been sent.'}</AuthFeedback> : <>
        <p id="recovery-guidance" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{reset ? 'Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.' : 'Enter your email address to request password reset instructions.'}</p>
        <form noValidate onSubmit={submit} aria-busy={busy} className="mt-6 space-y-5">
          {fields.map(([key, label]) => <div key={key}>
            <label htmlFor={`recovery-${key}`} className="text-sm font-medium">{label}</label>
            <input ref={node => { inputs.current[key] = node }} id={`recovery-${key}`} name={key} type={key === 'email' ? 'email' : visible[key] ? 'text' : 'password'} autoComplete={key === 'email' ? 'email' : 'new-password'} required disabled={busy} value={values[key]} onChange={event => { setValues(previous => ({ ...previous, [key]: event.target.value })); setErrors({}); setError(null) }} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `recovery-${key}-error` : 'recovery-guidance'} className={input} />
            {key !== 'email' && <button type="button" aria-pressed={Boolean(visible[key])} aria-controls={`recovery-${key}`} onClick={() => setVisible(previous => ({ ...previous, [key]: !previous[key] }))} className="mt-1 min-h-11 rounded px-2 text-sm text-teal-800 dark:text-teal-300 focus-visible:outline-2">{visible[key] ? 'Hide' : 'Show'} {label.toLowerCase()}</button>}
            {errors[key] && <FieldError id={`recovery-${key}-error`}>{errors[key]}</FieldError>}
          </div>)}
          {error && <AuthFeedback>{error}</AuthFeedback>}
          <button type="submit" disabled={busy} className={`${button} w-full`}>{busy ? 'Please wait...' : reset ? 'Reset password' : 'Send reset instructions'}</button>
        </form>
      </>}
      {reset && <Link to="/forgot-password" className="mt-5 block rounded text-sm text-teal-800 dark:text-teal-300 underline focus-visible:outline-2">Request a new reset link</Link>}
      <Link to="/login" className="mt-5 block rounded text-sm text-teal-800 dark:text-teal-300 underline focus-visible:outline-2">Back to Login</Link>
    </section>
  </main>
}
