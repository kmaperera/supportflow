import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUser } from '../../api/userApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { validateCreateUser } from './createUserValidation'

const initial = { firstName: '', lastName: '', email: '', role: 'EMPLOYEE', password: '', confirmPassword: '', phone: '', department: '' }
const labels = { firstName: 'First name', lastName: 'Last name', email: 'Email', role: 'Role', password: 'Password', confirmPassword: 'Confirm Password', phone: 'Phone', department: 'Department' }
const control = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-60'
const button = 'min-h-11 cursor-pointer rounded-lg border border-teal-700 px-4 py-2 font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export default function CreateUserPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const pending = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const next = validateCreateUser(values)
    setErrors(next); setError(null)
    if (Object.keys(next).length) return
    pending.current = true; setCreating(true)
    try {
      await createUser(values)
      if (!active.current) return
      setValues(initial)
      navigate('/admin/users', { replace: true, state: { userCreated: true } })
    } catch (cause) {
      if (!active.current) return
      if (cause?.response?.status === 409) {
        setErrors({ email: 'A user with this email already exists.' })
        setError('A user with this email already exists.')
      } else {
        const fields = {}
        if (cause?.response?.status === 422 && Array.isArray(cause.response.data?.errors)) {
          for (const item of cause.response.data.errors) if (Object.hasOwn(labels, item.field)) fields[item.field] = `Please check ${labels[item.field].toLowerCase()}.`
        }
        setErrors(fields)
        setError(getApiErrorMessage(cause, 'Unable to create user. Please check the form and try again.'))
      }
    } finally { pending.current = false; if (active.current) setCreating(false) }
  }
  return <div className="max-w-4xl space-y-5">
    <header><h1 className="text-2xl font-semibold">Create User</h1><p className="mt-2 text-slate-600">New accounts are active and must change their password at first login.</p></header>
    {error && <AuthFeedback>{error}</AuthFeedback>}
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">{Object.entries(labels).map(([field, label]) => {
        const optional = ['phone', 'department'].includes(field)
        return <div key={field} className="min-w-0"><label htmlFor={`create-user-${field}`} className="text-sm font-semibold">{label}{optional ? ' (optional)' : ' *'}</label>
          {field === 'role' ? <select id={`create-user-${field}`} className={control} required disabled={creating} value={values.role} aria-invalid={Boolean(errors.role)} aria-describedby={`create-user-${field}-error`} onChange={event => { setValues(previous => ({ ...previous, role: event.target.value })); setErrors(previous => ({ ...previous, role: null })) }}>{[['EMPLOYEE', 'Employee'], ['TECHNICIAN', 'Technician'], ['ADMIN', 'Admin']].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select> : <input id={`create-user-${field}`} className={control} type={field.toLowerCase().includes('password') ? 'password' : field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} autoComplete={field.toLowerCase().includes('password') ? 'new-password' : 'off'} required={!optional} disabled={creating} value={values[field]} aria-invalid={Boolean(errors[field])} aria-describedby={`create-user-${field}-error${field === 'password' ? ' password-help' : ''}`} onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); setErrors(previous => ({ ...previous, [field]: null })) }} />}
          {field === 'password' && <p id="password-help" className="mt-1 text-xs text-slate-600">At least 8 characters, including uppercase, lowercase, and a number.</p>}
          <div id={`create-user-${field}-error`}>{errors[field] && <p role="alert" className="mt-1 text-sm text-red-700">{errors[field]}</p>}</div>
        </div>
      })}</div>
      <div className="flex flex-wrap gap-3"><button type="submit" className={button} disabled={creating}>{creating ? 'Creating user...' : 'Create User'}</button><button type="button" className={button} disabled={creating} onClick={() => navigate('/admin/users')}>Cancel</button></div>
    </form>
  </div>
}
