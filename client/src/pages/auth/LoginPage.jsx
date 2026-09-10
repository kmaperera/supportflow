import { useRef, useState } from 'react'
import { login, getLoginErrorMessage } from '../../api/authApi'
import { useAuth } from '../../auth/useAuth'

function LoginPage() {
  const { isInitializing, establishSession, authError, setAuthError, clearAuthError } = useAuth()
  const [isSubmitting, setSubmitting] = useState(false)
  const [loginSucceeded, setLoginSucceeded] = useState(false)
  const submissionPending = useRef(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const emailInput = useRef(null)
  const passwordInput = useRef(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionPending.current || isInitializing) return
    clearAuthError()
    setLoginSucceeded(false)
    const nextErrors = {}
    if (!email.trim()) nextErrors.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!password) nextErrors.password = 'Enter your password.'
    setErrors(nextErrors)
    if (nextErrors.email) emailInput.current?.focus()
    else if (nextErrors.password) passwordInput.current?.focus()
    if (Object.keys(nextErrors).length) return
    submissionPending.current = true
    setSubmitting(true)
    try {
      const { user, accessToken } = await login({ email: email.trim(), password })
      establishSession(user, accessToken)
      setPassword('')
      setShowPassword(false)
      setLoginSucceeded(true)
    } catch (error) {
      setAuthError(getLoginErrorMessage(error))
    } finally {
      submissionPending.current = false
      setSubmitting(false)
    }
  }

  const inputClass = 'mt-2 block w-full rounded-lg border bg-white px-3.5 py-3 text-base text-slate-900 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20'

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 lg:grid lg:grid-cols-[1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 px-12 py-12 text-white lg:flex xl:px-20" aria-label="About SupportFlow">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400 text-xl font-bold text-slate-900" aria-hidden="true">S</span>
          <span className="text-xl font-semibold tracking-tight">SupportFlow</span>
        </div>
        <div className="relative z-10 my-16 max-w-lg">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">IT Helpdesk &amp; Ticket Management</p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">Better support.<br />A smoother workday.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-300">Manage support requests, track ticket progress, and stay connected with your IT team.</p>
          <div className="mt-10 rounded-2xl border border-slate-700 bg-slate-800/80 p-6">
            <p className="text-sm font-medium text-slate-200">A clear path from request to resolution</p>
            <ol className="mt-6 grid grid-cols-3 gap-3 text-sm">
              {['Request', 'In progress', 'Resolved'].map((step, index) => (
                <li key={step} className="space-y-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-teal-300/40 text-xs font-semibold text-teal-200" aria-hidden="true">{index + 1}</span>
                  <span className="block text-slate-300">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="text-sm text-slate-400">Your team. Your requests. One place.</p>
      </section>

      <section className="flex min-h-screen flex-col items-center justify-center px-5 py-10 sm:px-10 lg:px-12" aria-labelledby="login-heading">
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 font-bold text-white">S</span>
          <div><p className="font-semibold">SupportFlow</p><p className="text-xs text-slate-500">IT Helpdesk &amp; Ticket Management</p></div>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-teal-700">Your support workspace</p>
          <h2 id="login-heading" className="text-3xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Sign in to your SupportFlow account.</p>
          <form onSubmit={handleSubmit} aria-busy={isSubmitting} noValidate className="mt-8 space-y-5">
            <div>
              <label htmlFor="login-email" className="text-sm font-medium">Email address</label>
              <input ref={emailInput} id="login-email" name="email" disabled={isSubmitting || isInitializing} type="email" autoComplete="email" required value={email} onChange={event => { clearAuthError(); setLoginSucceeded(false); setEmail(event.target.value); setErrors(current => ({ ...current, email: undefined })) }} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : undefined} className={`${inputClass} ${errors.email ? 'border-red-600' : 'border-slate-300'}`} placeholder="you@company.com" />
              {errors.email && <p id="login-email-error" role="alert" className="mt-2 text-sm text-red-700">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="login-password" className="text-sm font-medium">Password</label>
              <div className="relative">
                <input ref={passwordInput} id="login-password" name="password" disabled={isSubmitting || isInitializing} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => { clearAuthError(); setLoginSucceeded(false); setPassword(event.target.value); setErrors(current => ({ ...current, password: undefined })) }} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : undefined} className={`${inputClass} pr-20 ${errors.password ? 'border-red-600' : 'border-slate-300'}`} />
                <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="login-password" className="absolute inset-y-1 right-1 rounded-md px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{showPassword ? 'Hide' : 'Show'}</button>
              </div>
              {errors.password && <p id="login-password-error" role="alert" className="mt-2 text-sm text-red-700">{errors.password}</p>}
            </div>
            {authError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{authError}</p>}
            {loginSucceeded && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">You are signed in.</p>}
            <button type="submit" disabled={isSubmitting || isInitializing} className="mt-2 w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Signing in...' : 'Sign in'}</button>
          </form>
          <p className="mt-7 border-t border-slate-100 pt-6 text-center text-xs leading-5 text-slate-500">Accounts are managed by your SupportFlow administrator.</p>
        </div>
        <p className="mt-7 text-xs text-slate-500">Need access? Contact your IT team.</p>
      </section>
    </main>
  )
}

export default LoginPage
