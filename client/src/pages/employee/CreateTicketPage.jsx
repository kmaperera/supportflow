import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthFeedback from '../../auth/AuthFeedback'
import { createTicket, getTicketCategories, getTicketPriorities } from '../../api/ticketApi'
import { validateCreateTicket, getCreateTicketErrors } from './createTicketValidation'

function useTicketOptions(fetchOptions) {
  const [state, setState] = useState({ options: [], loading: true, failed: false })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetchOptions({ signal: controller.signal }).then(options => {
      if (!controller.signal.aborted) setState({ options, loading: false, failed: false })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ options: [], loading: false, failed: true })
    })
    return () => controller.abort()
  }, [fetchOptions, attempt])
  return { ...state, retry: () => {
    setState({ options: [], loading: true, failed: false })
    setAttempt(value => value + 1)
  } }
}

export default function CreateTicketPage() {
  const categories = useTicketOptions(getTicketCategories)
  const priorities = useTicketOptions(getTicketPriorities)
  return <CreateTicketForm categories={categories.options} priorities={priorities.options} categoryState={categories} priorityState={priorities} />
}

export function CreateTicketForm({ categories = [], priorities = [], categoryState = {}, priorityState = {} }) {
  const navigate = useNavigate()
  const [values, setValues] = useState({ title: '', description: '', categoryId: '', priorityId: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const pending = useRef(false)
  const form = useRef(null)
  const optionsAvailable = !categoryState.loading && !priorityState.loading && categories.length > 0 && priorities.length > 0
  const inputClass = 'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:border-teal-700 focus:outline-2 focus:outline-teal-700 disabled:bg-slate-100 disabled:text-slate-500'

  function update(event) {
    const { name, value } = event.target
    setValues(previous => ({ ...previous, [name]: value }))
    setErrors(previous => ({ ...previous, [name]: undefined }))
  }

  async function submit(event) {
    event.preventDefault()
    if (pending.current || !optionsAvailable) return
    const nextErrors = validateCreateTicket(values)
    if (!categories.some(option => String(option.id) === values.categoryId)) nextErrors.categoryId = 'Select a category.'
    if (!priorities.some(option => String(option.id) === values.priorityId)) nextErrors.priorityId = 'Select a priority.'
    setErrors(nextErrors)
    setError(null)
    if (Object.keys(nextErrors).length) {
      form.current.elements.namedItem(Object.keys(nextErrors)[0])?.focus()
      return
    }
    pending.current = true
    setCreating(true)
    try {
      const ticket = await createTicket(values)
      navigate('/employee/tickets', { replace: true, state: { createdTicketNumber: ticket.ticketNumber } })
    } catch (cause) {
      const feedback = getCreateTicketErrors(cause)
      setError(feedback.message)
      setErrors(feedback.fields)
      pending.current = false
      setCreating(false)
    }
  }

  return <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
    <h1 className="text-2xl font-semibold">Create Ticket</h1>
    <p className="mt-2 text-sm text-slate-600">Tell us what went wrong and how it affects your work. All fields are required.</p>
    <form ref={form} onSubmit={submit} noValidate className="mt-6 space-y-6" aria-busy={creating}>
      {error && <AuthFeedback>{error}</AuthFeedback>}
      <fieldset disabled={creating} className="space-y-6">
        <legend className="sr-only">Support request details</legend>
        {[
          { name: 'title', label: 'Ticket Title', min: 5, max: 200, hint: 'Summarize your issue in 5–200 characters.' },
          { name: 'description', label: 'Description', min: 10, max: 5000, hint: 'Include what happened, any error messages, and what you have tried (10–5,000 characters).' },
        ].map(field => <div key={field.name}>
          <label htmlFor={field.name} className="text-sm font-semibold">{field.label}</label>
          {field.name === 'description' ? <textarea id={field.name} name={field.name} value={values[field.name]} onChange={update} required minLength={field.min} maxLength={field.max} rows={7} className={`${inputClass} resize-y`} aria-invalid={Boolean(errors[field.name])} aria-describedby={`${field.name}-hint ${field.name}-error`} /> :
            <input id={field.name} name={field.name} value={values[field.name]} onChange={update} required minLength={field.min} maxLength={field.max} className={inputClass} aria-invalid={Boolean(errors[field.name])} aria-describedby={`${field.name}-hint ${field.name}-error`} />}
          <p id={`${field.name}-hint`} className="mt-2 text-sm text-slate-500">{field.hint}</p>
          <p id={`${field.name}-error`} className="mt-1 text-sm text-red-800">{errors[field.name]}</p>
        </div>)}
        <div className="grid gap-6 sm:grid-cols-2">
          {[['categoryId', 'Category', categories, categoryState, 'categories'], ['priorityId', 'Priority', priorities, priorityState, 'priorities']].map(([name, label, options, optionState, plural]) => <div key={name}>
            <label htmlFor={name} className="text-sm font-semibold">{label}</label>
            <select id={name} name={name} value={values[name]} onChange={update} required disabled={!options.length} className={inputClass} aria-invalid={Boolean(errors[name])} aria-describedby={`${name}-error${!optionsAvailable ? ' selection-notice' : ''}`}>
              <option value="">{optionState.loading ? `Loading ${plural}...` : optionState.failed ? `Unable to load ${plural}.` : options.length ? `Select a ${label.toLowerCase()}` : `No ${plural} available`}</option>
              {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <p id={`${name}-error`} className="mt-1 text-sm text-red-800">{errors[name]}</p>
            {optionState.failed && <div className="mt-2">
              <AuthFeedback>Unable to load {plural}.</AuthFeedback>
              <button type="button" onClick={optionState.retry} className="mt-2 rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2 focus-visible:outline-offset-2">Retry {plural}</button>
            </div>}
          </div>)}
        </div>
      </fieldset>
      {!optionsAvailable && <p id="selection-notice" role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{categoryState.loading || priorityState.loading ? 'Loading ticket options...' : 'Categories and priorities must be available before you can submit a ticket.'}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={creating || !optionsAvailable} className="rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50">{creating ? 'Creating ticket...' : 'Create Ticket'}</button>
        {!creating && <Link to="/employee" className="rounded text-sm font-semibold text-slate-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Cancel</Link>}
        <span role="status" className="sr-only">{creating ? 'Creating ticket...' : ''}</span>
      </div>
    </form>
  </section>
}
