import ThemeToggle from '../../theme/ThemeToggle'
import FieldError from '../../components/FieldError'
import AuthFeedback from '../../auth/AuthFeedback'
import { getAuthFieldErrors } from '../../api/apiError'
import LogoutButton from '../../auth/LogoutButton'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { changePassword, getPasswordChangeErrorMessage } from '../../api/authApi'
import { validatePasswordChange } from '../../auth/passwordValidation'

const emptyFields = { currentPassword: '', newPassword: '', confirmPassword: '' }
const fields = [
  { key: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { key: 'newPassword', label: 'New password', autoComplete: 'new-password' },
  { key: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
]
export default function ChangePasswordPage() {
  const { clearSession } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState(emptyFields)
  const [visible, setVisible] = useState({})
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const pending = useRef(false)
  const inputs = useRef({})
  async function handleSubmit(event) {
    event.preventDefault()
    if (pending.current) return
    setServerError(null)
    const nextErrors = validatePasswordChange(values)
    setErrors(nextErrors)
    const firstInvalid = fields.find(field => nextErrors[field.key])
    if (firstInvalid) { inputs.current[firstInvalid.key]?.focus(); return }
    pending.current = true
    setSubmitting(true)
    try {
      await changePassword(values)
      setValues(emptyFields)
      setVisible({})
      clearSession()
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    } catch (error) {
      setServerError(getPasswordChangeErrorMessage(error))
      setErrors(getAuthFieldErrors(error, fields.map(field => field.key)))
    } finally {
      pending.current = false
      setSubmitting(false)
    }
  }
  return (
    <main className="auth-ui flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-5 py-10">
      <section aria-labelledby="password-change-heading" className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-9">
        <header className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-teal-700 dark:text-teal-300">SupportFlow</p><ThemeToggle /></header>
        <h1 id="password-change-heading" className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Change your password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Your account requires a new password before you can continue.</p>
        <p id="password-guidance" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.</p>
        <form noValidate onSubmit={handleSubmit} aria-busy={isSubmitting} className="mt-6 space-y-5">
          <p role="status" aria-live="polite" className="sr-only">{isSubmitting ? 'Changing password...' : ''}</p>
          {fields.map(({ key, label, autoComplete }) => (
            <div key={key}>
              <label htmlFor={key} className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</label>
              <div className="relative mt-2">
                <input ref={element => { inputs.current[key] = element }} id={key} name={key} type={visible[key] ? 'text' : 'password'} autoComplete={autoComplete} required disabled={isSubmitting} value={values[key]} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setErrors({}); setServerError(null) }} aria-invalid={Boolean(errors[key])} aria-describedby={`${key === 'newPassword' ? 'password-guidance ' : ''}${errors[key] ? `${key}-error` : ''}`.trim() || undefined} className={`w-full rounded-lg border bg-white dark:bg-slate-900 py-3 pr-20 pl-3.5 text-slate-900 dark:text-slate-100 outline-none focus:border-teal-700 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-700/20 dark:focus:ring-teal-400/20 ${errors[key] ? 'border-red-600 dark:border-red-400' : 'border-slate-300 dark:border-slate-700'}`} />
                <button type="button" aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[key])} aria-controls={key} onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))} className="absolute inset-y-1 right-1 rounded-md px-3 text-sm font-medium text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400">{visible[key] ? 'Hide' : 'Show'}</button>
              </div>
              {errors[key] && <FieldError id={`${key}-error`}>{errors[key]}</FieldError>}
            </div>
          ))}
          {serverError && <AuthFeedback>{serverError}</AuthFeedback>}
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Changing password...' : 'Change password'}</button>
        </form><LogoutButton disabled={isSubmitting} />
      </section>
    </main>
  )
}
