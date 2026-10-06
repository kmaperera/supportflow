import { focusFirstError } from '../../components/formValidation'
import FilterBar, { ClearFilters } from '../../components/FilterBar'
import Pagination from '../../components/Pagination'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useState } from 'react'
import { auditFilterFields, getAuditLogs } from '../../api/auditApi'
import { getApiErrorMessage } from '../../api/apiError'
import { formatTicketDate } from '../employee/ticketFormatting'
import { validateReportDates } from './reportValidation'

const blank = () => Object.fromEntries(auditFilterFields.map(field => [field, '']))
const labels = { search: 'Search audit logs', action: 'Action (exact value)', actorUserId: 'Actor user ID', entityType: 'Entity type (exact value)', entityId: 'Entity ID', startDate: 'Start date (UTC)', endDate: 'End date (UTC)' }
const button = 'inline-flex min-h-11 w-fit cursor-pointer items-center rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
export default function AdminAuditLogsPage() {
  const [draft, setDraft] = useState(blank)
  const [request, setRequest] = useState({ filters: blank(), page: 1 })
  const [errors, setErrors] = useState({})
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getAuditLogs(request.filters, { page: request.page, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (request.page > lastPage) { setRequest(previous => previous === request ? { ...previous, page: lastPage } : previous); return }
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(cause => { if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(cause, 'Unable to load audit logs.') }) })
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : null
  const filtered = Object.values(request.filters).some(value => value.trim())
  const unapplied = auditFilterFields.some(field => draft[field].trim() !== request.filters[field])
  function apply(event) {
    event.preventDefault()
    const filters = Object.fromEntries(auditFilterFields.map(field => [field, draft[field].trim()]))
    const next = validateReportDates('audit', filters)
    for (const field of ['actorUserId', 'entityId']) {
      const value = filters[field]
      if (value && (!/^[1-9]\d*$/.test(value) || value.length > 20 || BigInt(value) > 18446744073709551615n)) next[field] = 'Enter a valid positive integer ID.'
    }
    setErrors(next)
    if (Object.keys(next).length) focusFirstError(Object.fromEntries(auditFilterFields.map(field => [field, next[field]])), field => `audit-${field}`)
    else setRequest({ filters, page: 1 })
  }
  function clear() { setDraft(blank()); setErrors({}); setRequest({ filters: blank(), page: 1 }) }
  return <div className="layout-page">
    <PageHeader title="Audit Logs" description="Review administrative and security-related events." />
    <FilterBar activeCount={Object.values(request.filters).filter(Boolean).length} as="form" onSubmit={apply} noValidate className="space-y-4 layout-panel">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{auditFilterFields.map(field => <div key={field} className="min-w-0"><label htmlFor={`audit-${field}`} className="text-sm font-semibold">{labels[field]}</label><input id={`audit-${field}`} placeholder={field === 'search' ? 'Search audit logs...' : undefined} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 p-3 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400" type={field.endsWith('Date') ? 'date' : field === 'search' ? 'search' : 'text'} inputMode={field.endsWith('Id') ? 'numeric' : undefined} maxLength={field === 'search' ? 200 : field.endsWith('Id') ? 20 : 100} value={draft[field]} onChange={event => { setDraft(previous => ({ ...previous, [field]: event.target.value })); setErrors(previous => ({ ...previous, [field]: null })) }} aria-invalid={Boolean(errors[field])} aria-describedby={`audit-${field}-error`} /><p id={`audit-${field}-error`} role={errors[field] ? 'alert' : undefined} className="mt-1 text-sm text-red-700 dark:text-red-300">{errors[field]}</p></div>)}</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">Search matches action and description. Dates include the full UTC calendar day. Results appear newest first.</p>
      <div className="layout-actions"><button type="submit" className={button} disabled={!current}>Apply filters</button><ClearFilters disabled={!Object.values(draft).some(Boolean) && !filtered} onClick={clear} /></div>
    </FilterBar>
    {unapplied && <p className="text-sm text-slate-600 dark:text-slate-300">Apply filters to update the results.</p>}
    {!current && <ContentSkeleton initial={!result} variant="table" headers={["Time", "Actor", "Action", "Target", "Details"]}>Loading audit logs...</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load audit logs" message={<>{current.error}</>}><button className={button} onClick={() => setRequest(previous => ({ ...previous }))}>Retry</button></ErrorState>}
    {current?.data && <section className="min-w-0 space-y-4 layout-panel" aria-label="Audit records">
      {!current.data.logs.length ? <EmptyState compact title={filtered ? 'No audit logs match your current filters.' : 'No audit logs found.'} actions={filtered && <ClearFilters onClick={clear} />} /> : <div className="layout-table focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400" tabIndex={0} aria-label="Scrollable audit table"><table className="w-full text-left text-sm"><caption className="sr-only">Audit logs, newest first</caption><thead><tr>{['Time', 'Actor', 'Action', 'Target', 'Details'].map(label => <th scope="col" className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{current.data.logs.map(log => <tr key={log.id} className="border-t border-slate-200 dark:border-slate-700">
        <td className="min-w-40 p-3 align-top"><time dateTime={log.createdAt} title={log.createdAt}>{formatTicketDate(log.createdAt)}</time></td>
        <td className="min-w-40 p-3 align-top">{log.actor ? <><p>{log.actor.name || log.actor.email || `User ${log.actor.id}`}</p>{log.actor.email && <p className="break-all text-slate-500 dark:text-slate-400">{log.actor.email}</p>}{log.actor.role && <p className="text-xs text-slate-500 dark:text-slate-400">{log.actor.role}</p>}</> : 'No actor recorded'}</td>
        <td className="min-w-40 break-words p-3 align-top">{log.action}{log.metadata?.isDemo && <p className="mt-1 font-semibold text-slate-500 dark:text-slate-400">Demo record</p>}</td>
        <td className="min-w-32 break-words p-3 align-top">{log.entityType || 'Not specified'}{log.entityId != null && <p>ID: {log.entityId}</p>}</td>
        <td className="min-w-64 max-w-lg p-3 align-top"><p className="whitespace-pre-wrap break-words">{log.description || 'No description.'}</p>{(log.metadata || log.ipAddress) && <details className="mt-3"><summary className="w-fit cursor-pointer rounded text-teal-800 dark:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2">View details<span className="sr-only"> for audit record {log.id}</span></summary><div className="mt-2 space-y-2">{log.ipAddress && <p className="break-all">IP address: {log.ipAddress}</p>}{log.metadata && <pre className="whitespace-pre-wrap break-all rounded bg-slate-50 dark:bg-slate-950 p-3 text-xs">{JSON.stringify(log.metadata, null, 2)}</pre>}</div></details>}</td>
      </tr>)}</tbody></table></div>}
      <Pagination metadata={current.data.pagination} noun="logs" label="logs" disabled={false} onPageChange={page => setRequest(previous => ({ ...previous, page }))} />
    </section>}
  </div>
}
