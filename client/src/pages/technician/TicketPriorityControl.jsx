import { PriorityBadge } from '../../components/Badges'
import ErrorState from '../../components/ErrorState'
import LoadingState from '../../components/LoadingState'
import { useEffect, useState } from 'react'
import { getTicketPriorities } from '../../api/ticketApi'
import { formatTicketPriority } from '../employee/ticketFormatting'

import { canManagePriority } from './ticketPriorityEligibility'

export default function TicketPriorityControl({ ticket, userId, pending, onUpdate }) {
  return <section aria-labelledby="ticket-priority-heading" className="min-w-0 layout-panel">
    <h2 id="ticket-priority-heading" className="text-lg font-semibold">Priority</h2>
    <p className="mt-3 text-sm">Current priority: <PriorityBadge value={ticket.priority?.name} /></p>
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
  if (!current) return <LoadingState className="mt-3 text-sm">Loading priority options...</LoadingState>
  if (current.error) return <ErrorState compact className="mt-4" title="Unable to load priority options.">
    <button type="button" disabled={pending} onClick={() => setAttempt(value => value + 1)} className="cursor-pointer rounded text-sm text-teal-800 dark:text-teal-300 underline focus-visible:outline-2 disabled:cursor-not-allowed">Retry</button>
  </ErrorState>
  return <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => {
    event.preventDefault()
    if (!pending && valid && selected !== currentId) onUpdate(selected)
  }}>
    <label className="min-w-0 basis-full text-sm font-medium sm:basis-auto">Priority
      <select value={selected} disabled={pending || !options.length} onChange={event => setSelected(event.target.value)} className="mt-1 block min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-base focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm">
        {!options.some(option => String(option.id) === currentId) && <option value={currentId} disabled>{formatTicketPriority(ticket.priority?.name)} (current)</option>}
        {options.map(option => <option key={option.id} value={option.id}>{formatTicketPriority(option.name)}</option>)}
      </select>
    </label>
    <button type="submit" disabled={pending || !valid || selected === currentId} className="min-h-11 cursor-pointer rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Updating priority...' : 'Update Priority'}</button>
    {!options.length && <p className="basis-full text-sm text-slate-600 dark:text-slate-300">No priority options are available.</p>}
  </form>
}
