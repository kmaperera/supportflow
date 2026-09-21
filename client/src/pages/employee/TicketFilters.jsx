import { useEffect, useState } from 'react'
import { getTicketCategories, getTicketPriorities } from '../../api/ticketApi'
import { ticketStatuses, formatTicketPriority } from './ticketFormatting'

const controlClass = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-700'

function MetadataFilter({ label, value, onChange, fetchOptions }) {
  const [state, setState] = useState({ loading: true, options: [], error: false })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetchOptions({ signal: controller.signal }).then(options => {
      if (!controller.signal.aborted) setState({ loading: false, options, error: false })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ loading: false, options: [], error: true })
    })
    return () => controller.abort()
  }, [fetchOptions, attempt])
  const plural = label === 'Category' ? 'categories' : 'priorities'
  return <div className="min-w-0">
    <label className="text-sm font-medium">{label}
      <select className={controlClass} value={value} onChange={event => onChange(event.target.value)} disabled={state.loading || state.error}>
        <option value="">{state.loading ? `Loading ${plural}...` : `All ${plural}`}</option>
        {state.options.map(option => <option key={option.id} value={option.id}>{label === 'Priority' ? formatTicketPriority(option.name) : option.name}</option>)}
      </select>
    </label>
    {state.error && <div className="mt-1 text-sm"><p role="status">Unable to load {plural}.</p><button type="button" className="rounded text-teal-800 underline focus-visible:outline-2" onClick={() => { setState({ loading: true, options: [], error: false }); setAttempt(value => value + 1) }}>Retry {plural}</button></div>}
  </div>
}

export default function TicketFilters({ query, search, setSearch, onChange, onSearch, onReset }) {
  return <form onSubmit={event => { event.preventDefault(); onSearch() }} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="Ticket search and filters">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 basis-full sm:flex-1 text-sm font-medium">Search tickets
        <input type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tickets..." aria-describedby="ticket-search-hint" className={controlClass} />
      </label>
      <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2">Search</button>
    </div>
    <p id="ticket-search-hint" className="text-xs text-slate-500">Search ticket number, title, or description. Press Enter or select Search.</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-medium">Status<select className={controlClass} value={query.status || ''} onChange={event => onChange({ status: event.target.value })}>
        <option value="">All statuses</option>{ticketStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
      </select></label>
      <MetadataFilter label="Category" value={query.categoryId || ''} onChange={categoryId => onChange({ categoryId })} fetchOptions={getTicketCategories} />
      <MetadataFilter label="Priority" value={query.priorityId || ''} onChange={priorityId => onChange({ priorityId })} fetchOptions={getTicketPriorities} />
      <label className="text-sm font-medium">Sort by<select className={controlClass} value={`${query.sortBy || 'created_at'}:${query.order || 'desc'}`} onChange={event => { const [sortBy, order] = event.target.value.split(':'); onChange({ sortBy, order }) }}>
        <option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option><option value="updated_at:desc">Recently updated</option><option value="ticket_number:asc">Ticket number</option><option value="priority:asc">Priority (display order)</option>
      </select></label>
    </div>
    <button type="button" onClick={onReset} className="rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2">Clear filters</button>
  </form>
}
