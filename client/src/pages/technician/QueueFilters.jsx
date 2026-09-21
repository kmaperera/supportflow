import { MetadataFilter } from '../employee/TicketFilters'
import { ticketStatuses } from '../employee/ticketFormatting'
import { getTicketCategories, getTicketPriorities } from '../../api/ticketApi'

const controlClass = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-base sm:text-sm focus-visible:outline-2 focus-visible:outline-teal-700'

export default function QueueFilters({ query, search, setSearch, onChange, onSearch, onReset }) {
  return <form aria-label="Queue search and filters" onSubmit={event => { event.preventDefault(); onSearch() }} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 [&_select]:min-h-11 [&_select]:text-base sm:[&_select]:text-sm">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 basis-full text-sm font-medium sm:flex-1">Search
        <input type="search" maxLength={200} placeholder="Search tickets..." value={search} onChange={event => setSearch(event.target.value)} aria-describedby="queue-search-hint" className={controlClass} />
      </label>
      <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Search</button>
    </div>
    <p id="queue-search-hint" className="text-xs text-slate-500">Search ticket number, title, or description. Results update as you type.</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-sm font-medium">Status
        <select value={query.status || ''} onChange={event => onChange({ status: event.target.value })} className={controlClass}>
          <option value="">All statuses</option>{ticketStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </label>
      <MetadataFilter label="Category" value={query.categoryId || ''} onChange={categoryId => onChange({ categoryId })} fetchOptions={getTicketCategories} />
      <MetadataFilter label="Priority" value={query.priorityId || ''} onChange={priorityId => onChange({ priorityId })} fetchOptions={getTicketPriorities} />
      <label className="min-w-0 text-sm font-medium">Sort by
        <select value={query.sortBy ? `${query.sortBy}:${query.order}` : ''} onChange={event => { const [sortBy = '', order = ''] = event.target.value.split(':'); onChange({ sortBy, order }) }} className={controlClass}>
          <option value="">Default: priority, then oldest</option>
          <option value="created_at:asc">Oldest created first</option>
          <option value="created_at:desc">Newest first</option>
          <option value="priority:desc">Highest priority</option>
          <option value="priority:asc">Lowest priority</option>
          <option value="updated_at:desc">Recently updated</option>
        </select>
      </label>
    </div>
    <button type="button" onClick={onReset} className="rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2 focus-visible:outline-offset-2">Clear filters</button>
  </form>
}
