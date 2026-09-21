import { useEffect, useRef, useState } from 'react'
import { getTicketCategories, getTicketPriorities, updateTicket } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import { validateCreateTicket, getCreateTicketErrors } from './createTicketValidation'
import AuthFeedback from '../../auth/AuthFeedback'

export default function EditTicketForm({ ticket, onCancel, onSaved, onIneligible }) {
  const [values, setValues] = useState({ title: ticket.title, description: ticket.description, categoryId: String(ticket.category.id), priorityId: String(ticket.priority.id) })
  const [options, setOptions] = useState(null)
  const [lookupError, setLookupError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const form = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getTicketCategories({ signal: controller.signal }), getTicketPriorities({ signal: controller.signal })]).then(([categories, priorities]) => {
      if (!controller.signal.aborted) setOptions({ categoryId: categories, priorityId: priorities })
    }).catch(() => { if (!controller.signal.aborted) setLookupError(true) })
    return () => controller.abort()
  }, [attempt])
  async function submit(event) {
    event.preventDefault()
    if (pending.current || !options) return
    const next = validateCreateTicket(values)
    for (const [field, original, label] of [['categoryId', ticket.category, 'category'], ['priorityId', ticket.priority, 'priority']]) {
      if (values[field] !== String(original.id) && !options[field].some(option => String(option.id) === values[field])) next[field] = `Select an available ${label}.`
    }
    setErrors(next)
    setError(null)
    if (Object.keys(next).length) { form.current.elements.namedItem(Object.keys(next)[0])?.focus(); return }
    pending.current = true
    setSaving(true)
    try { onSaved(await updateTicket(ticket.id, values)) }
    catch (cause) {
      if (cause?.response?.status === 409) { onIneligible(); return }
      const feedback = getCreateTicketErrors(cause)
      setErrors(feedback.fields)
      setError(Object.keys(feedback.fields).length ? feedback.message :
        cause?.response?.status === 404 ? 'This ticket is not available.' : getApiErrorMessage(cause, 'Unable to save changes. Please try again.'))
    } finally { pending.current = false; setSaving(false) }
  }
  function change(event) {
    const { name, value } = event.target
    setValues(previous => ({ ...previous, [name]: value }))
    setErrors(previous => ({ ...previous, [name]: undefined }))
  }
  const inputClass = 'mt-2 block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700'
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-8" aria-labelledby="edit-ticket-heading">
    <h2 id="edit-ticket-heading" className="text-lg font-semibold">Edit Ticket</h2>
    {!options && !lookupError && <p role="status" className="mt-3 text-sm">Loading categories and priorities...</p>}
    {lookupError && <div className="mt-3"><AuthFeedback>Unable to load categories and priorities.</AuthFeedback><button type="button" className="mt-2 rounded text-teal-800 underline focus-visible:outline-2" onClick={() => { setLookupError(false); setAttempt(value => value + 1) }}>Retry options</button></div>}
    <form ref={form} onSubmit={submit} noValidate className="mt-5 space-y-4">
      {error && <AuthFeedback>{error}</AuthFeedback>}
      <fieldset disabled={saving} className="space-y-4">
        <legend className="sr-only">Editable ticket fields</legend>
        {[['title', 'Title', 5, 200], ['description', 'Description', 10, 5000]].map(([name, label, min, max]) => <div key={name}>
          <label htmlFor={`edit-${name}`} className="text-sm font-semibold">{label}</label>
          {name === 'description' ? <textarea id={`edit-${name}`} name={name} value={values[name]} onChange={change} required minLength={min} maxLength={max} rows={7} aria-invalid={Boolean(errors[name])} aria-describedby={`edit-${name}-error`} className={inputClass} /> : <input id={`edit-${name}`} name={name} value={values[name]} onChange={change} required minLength={min} maxLength={max} aria-invalid={Boolean(errors[name])} aria-describedby={`edit-${name}-error`} className={inputClass} />}
          <p id={`edit-${name}-error`} className="mt-1 text-sm text-red-800">{errors[name]}</p>
        </div>)}
        <div className="grid gap-4 sm:grid-cols-2">
          {[['categoryId', 'Category', ticket.category], ['priorityId', 'Priority', ticket.priority]].map(([name, label, original]) => <div key={name}>
            <label htmlFor={`edit-${name}`} className="text-sm font-semibold">{label}</label>
            <select id={`edit-${name}`} name={name} value={values[name]} onChange={change} disabled={!options} required aria-invalid={Boolean(errors[name])} aria-describedby={`edit-${name}-error`} className={inputClass}>
              {!(options?.[name] || []).some(option => String(option.id) === String(original.id)) && <option value={original.id}>{original.name} (current)</option>}
              {(options?.[name] || []).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <p id={`edit-${name}-error`} className="mt-1 text-sm text-red-800">{errors[name]}</p>
          </div>)}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving || !options} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        <button type="button" disabled={saving} onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 disabled:opacity-50">Cancel</button>
      </div>
      <p role="status" className="sr-only">{saving ? 'Saving changes...' : ''}</p>
    </form>
  </section>
}
