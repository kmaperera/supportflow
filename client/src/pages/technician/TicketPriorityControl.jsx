import { useEffect, useState } from 'react'
import { getTicketPriorities } from '../../api/ticketApi'
import { formatTicketPriority } from '../employee/ticketFormatting'

import { canManagePriority } from './ticketPriorityEligibility'

export default function TicketPriorityControl({ ticket, userId, pending, onUpdate }) {
  return <section aria-labelledby="ticket-priority-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 id="ticket-priority-heading" className="text-lg font-semibold">Priority</h2>
    <p className="mt-3 text-sm">Current priority: <span className="font-semibold">{formatTicketPriority(ticket.priority?.name)}</span></p>
    {canManagePriority(ticket, userId) && <PriorityForm key={String(ticket.priority?.id)} ticket={ticket} pending={pending} onUpdate={onUpdate} />}
  </section>
}

function PriorityForm({ ticket, pending, onUpdate }) {
  const [selected, setSelected] = useState(String(ticket.priority?.id ?? ''))
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getTicketPriorities({ signal: controller.signal }).then(options => {
      if (!controller.signal.aborted) setResult({ attempt, options })
    }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }) })
    return () => controller.abort()
  }, [attempt])
  const current = result?.attempt === attempt ? result : null
  const currentId = String(ticket.priority?.id ?? '')
  const options = current?.options || []
  const valid = options.some(option => String(option.id) === selected)
  if (!current) return <p role="status" className="mt-3 text-sm">Loading priority options...</p>
  if (current.error) return <div className="mt-3 space-y-2">
    <p role="alert" className="text-sm">Unable to load priority options.</p>
    <button type="button" disabled={pending} onClick={() => setAttempt(value => value + 1)} className="cursor-pointer rounded text-sm text-teal-800 underline focus-visible:outline-2 disabled:cursor-not-allowed">Retry</button>
  </div>
  return <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => {
    event.preventDefault()
    if (!pending && valid && selected !== currentId) onUpdate(selected)
  }}>
    <label className="min-w-0 basis-full text-sm font-medium sm:basis-auto">Priority
      <select value={selected} disabled={pending || !options.length} onChange={event => setSelected(event.target.value)} className="mt-1 block min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-2 text-base focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm">
        {!options.some(option => String(option.id) === currentId) && <option value={currentId} disabled>{formatTicketPriority(ticket.priority?.name)} (current)</option>}
        {options.map(option => <option key={option.id} value={option.id}>{formatTicketPriority(option.name)}</option>)}
      </select>
    </label>
    <button type="submit" disabled={pending || !valid || selected === currentId} className="min-h-11 cursor-pointer rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Updating...' : 'Update Priority'}</button>
    {!options.length && <p className="basis-full text-sm text-slate-600">No priority options are available.</p>}
  </form>
}
