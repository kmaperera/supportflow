import { useEffect, useRef, useState } from 'react'
import { getSlaPolicies, updateSlaPolicy } from '../../api/slaPolicyApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate, formatTicketPriority } from '../employee/ticketFormatting'
import { formatPolicyMinutes, validateSlaDurations } from './slaPolicyForm'

const button = 'min-h-11 w-fit cursor-pointer rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
export default function SlaSettingsPage() {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [success, setSuccess] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    getSlaPolicies({ signal: controller.signal }).then(data => { if (!controller.signal.aborted) setResult({ attempt, data }) }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }) })
    return () => controller.abort()
  }, [attempt])
  const current = result?.attempt === attempt ? result : null
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold">SLA Settings</h1><p className="mt-2 text-slate-600">Configure response and resolution targets by priority.</p></header>
    <p className="text-sm text-slate-600">Changes apply to new tickets and future SLA recalculations triggered by priority changes. Existing ticket deadlines are not automatically rewritten.</p>
    {success && <AuthFeedback variant="success">SLA policy updated successfully.</AuthFeedback>}
    {!current && <p role="status">Loading SLA settings...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>Unable to load SLA settings.</AuthFeedback><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {current?.data && (!current.data.length ? <p>No SLA policies found.</p> : <div className="grid min-w-0 gap-4 xl:grid-cols-2">{current.data.map(policy => <PolicyCard key={policy.id} policy={policy} onSaved={() => { setSuccess(true); setAttempt(value => value + 1) }} />)}</div>)}
  </div>
}
function PolicyCard({ policy, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState({ responseTimeMinutes: String(policy.responseTimeMinutes), resolutionTimeMinutes: String(policy.resolutionTimeMinutes) })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const validation = validateSlaDurations(values)
    setErrors(validation); setError(null)
    if (Object.keys(validation).length) return
    pending.current = true; setSaving(true)
    try {
      await updateSlaPolicy(policy.id, { responseTimeMinutes: Number(values.responseTimeMinutes), resolutionTimeMinutes: Number(values.resolutionTimeMinutes) })
      if (mounted.current) { setEditing(false); onSaved() }
    } catch (cause) {
      if (!mounted.current) return
      setError(cause?.response?.status === 404 ? 'SLA policy not found.' : getApiErrorMessage(cause, 'Unable to update SLA policy. Please try again.'))
      if (cause?.response?.status === 422 && Array.isArray(cause.response.data?.errors)) {
        const fields = {}
        for (const item of cause.response.data.errors) if (Object.hasOwn(values, item.field)) fields[item.field] = 'Please check this duration in minutes.'
        setErrors(fields)
      }
    } finally { pending.current = false; if (mounted.current) setSaving(false) }
  }
  return <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold">{formatTicketPriority(policy.priorityName)}</h2>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Response target', formatPolicyMinutes(policy.responseTimeMinutes)], ['Resolution target', formatPolicyMinutes(policy.resolutionTimeMinutes)], ['Status', policy.isActive ? 'Active' : 'Inactive'], ['Updated', formatTicketDate(policy.updatedAt)]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
    {!editing ? <button className={button} onClick={() => { setEditing(true); setError(null); setErrors({}) }}>Edit</button> : <form onSubmit={submit} noValidate className="space-y-4 border-t border-slate-200 pt-4">
      {error && <AuthFeedback>{error}</AuthFeedback>}
      <p className="text-sm text-slate-600">Enter whole minutes (60 minutes = 1 hour; 1,440 minutes = 24 hours).</p>
      {['responseTimeMinutes', 'resolutionTimeMinutes'].map(field => <div key={field}><label className="text-sm font-medium" htmlFor={`${policy.id}-${field}`}>{field === 'responseTimeMinutes' ? 'Response' : 'Resolution'} target (minutes) *</label><input id={`${policy.id}-${field}`} type="number" min="1" max="4294967295" step="1" required disabled={saving} className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 p-3 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50" value={values[field]} aria-invalid={Boolean(errors[field])} aria-describedby={`${policy.id}-${field}-error`} onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); setErrors(previous => ({ ...previous, [field]: null })) }} /><div id={`${policy.id}-${field}-error`}>{errors[field] && <p role="alert" className="mt-1 text-sm text-red-700">{errors[field]}</p>}</div></div>)}
      <div className="flex flex-wrap gap-3"><button type="submit" className={button} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button><button type="button" className={button} disabled={saving} onClick={() => { setEditing(false); setValues({ responseTimeMinutes: String(policy.responseTimeMinutes), resolutionTimeMinutes: String(policy.resolutionTimeMinutes) }) }}>Cancel</button></div>
    </form>}
  </section>
}
