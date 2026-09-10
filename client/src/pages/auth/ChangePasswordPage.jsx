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
    } finally {
      pending.current = false
      setSubmitting(false)
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <section aria-labelledby="password-change-heading" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <p className="mb-3 text-sm font-semibold text-teal-700">SupportFlow</p>
        <h1 id="password-change-heading" className="text-2xl font-semibold text-slate-900">Change your password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Your account requires a new password before you can continue.</p>
        <p id="password-guidance" className="mt-3 text-sm leading-6 text-slate-600">Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.</p>
        <form noValidate onSubmit={handleSubmit} aria-busy={isSubmitting} className="mt-6 space-y-5">
          {fields.map(({ key, label, autoComplete }) => (
            <div key={key}>
              <label htmlFor={key} className="text-sm font-medium text-slate-900">{label}</label>
              <div className="relative mt-2">
                <input ref={element => { inputs.current[key] = element }} id={key} name={key} type={visible[key] ? 'text' : 'password'} autoComplete={autoComplete} required disabled={isSubmitting} value={values[key]} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setErrors({}); setServerError(null) }} aria-invalid={Boolean(errors[key])} aria-describedby={`${key === 'newPassword' ? 'password-guidance ' : ''}${errors[key] ? `${key}-error` : ''}`.trim() || undefined} className={`w-full rounded-lg border bg-white py-3 pr-20 pl-3.5 text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 ${errors[key] ? 'border-red-600' : 'border-slate-300'}`} />
                <button type="button" aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[key])} aria-controls={key} onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))} className="absolute inset-y-1 right-1 rounded-md px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{visible[key] ? 'Hide' : 'Show'}</button>
              </div>
              {errors[key] && <p id={`${key}-error`} role="alert" className="mt-2 text-sm text-red-700">{errors[key]}</p>}
            </div>
          ))}
          {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</p>}
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Changing password...' : 'Change password'}</button>
        </form>
      </section>
    </main>
  )
}
