import PageHeader from '../../layouts/PageHeader'
import { useEffect, useRef, useState } from 'react'
import { getReport, reportTypes } from '../../api/reportApi'
import { getCategories } from '../../api/categoryApi'
import { getTicketPriorities } from '../../api/ticketApi'
import { getAdminDashboardSection } from '../../api/dashboardApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { ticketStatuses, formatTicketPriority } from '../employee/ticketFormatting'
import { validateReportDates } from './reportValidation'
import ReportResults from './ReportResults'
import ReportExportActions from './ReportExportActions'

const button = 'inline-flex min-h-11 w-fit cursor-pointer items-center justify-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50'
const initial = () => ({ startDate: '', endDate: '', search: '', status: '', categoryId: '', priorityId: '', technicianId: '', sortBy: 'createdAt', sortOrder: 'desc' })
const labels = { startDate: 'Start date', endDate: 'End date', status: 'Status', categoryId: 'Ticket category', priorityId: 'Priority', technicianId: 'Currently assigned technician', search: 'Search tickets', sortBy: 'Sort by', sortOrder: 'Sort direction' }
const lookups = {
  categoryId: signal => getCategories({ signal }).then(rows => rows.map(row => ({ value: String(row.id), label: `${row.name}${row.isActive ? '' : ' (inactive)'}` }))),
  priorityId: signal => getTicketPriorities({ signal }).then(rows => rows.map(row => ({ value: String(row.id), label: formatTicketPriority(row.name) }))),
  technicianId: signal => getAdminDashboardSection('workload', { signal }).then(rows => rows.map(row => ({ value: String(row.technicianId), label: `${row.technicianName || row.email}${row.isActive ? '' : ' (inactive)'}` }))),
}
export default function AdminReportsPage() {
  const [type, setType] = useState('tickets')
  return <div className="layout-page"><PageHeader title="Reports" description="Choose a report and criteria, then generate structured results." />
    <div className="max-w-lg"><label className="text-sm font-semibold" htmlFor="report-type">Report type</label><select id="report-type" className={input} value={type} onChange={event => setType(event.target.value)}>{Object.entries(reportTypes).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
    <ReportForm key={type} type={type} />
  </div>
}
function ReportForm({ type }) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [result, setResult] = useState(null)
  const [lastRequest, setLastRequest] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function generate(criteria, page = 1) {
    if (pending.current) return
    const next = validateReportDates(type, criteria)
    setErrors(next); setError('')
    if (Object.keys(next).length) return
    pending.current = true; setLoading(true)
    const abort = new AbortController()
    controller.current = abort
    setLastRequest({ criteria, page })
    try {
      const report = await getReport(type, criteria, { page, signal: abort.signal })
      if (!abort.signal.aborted) setResult({ report, criteria })
    } catch (cause) {
      if (!abort.signal.aborted) setError(getApiErrorMessage(cause, cause?.response?.status === 422 ? 'Please check the selected report criteria and date range.' : 'Unable to generate report.'))
    } finally { pending.current = false; if (!abort.signal.aborted) setLoading(false) }
  }
  const changed = result && JSON.stringify(result.criteria) !== JSON.stringify(values)
  const options = {
    status: ticketStatuses.map(row => ({ value: row.value, label: row.label })),
    sortBy: [['createdAt', 'Created date'], ['ticketNumber', 'Ticket number'], ['title', 'Title'], ['status', 'Status'], ['category', 'Category'], ['priority', 'Priority name'], ['requester', 'Requester first name'], ['technician', 'Technician first name']].map(([value, label]) => ({ value, label })),
    sortOrder: [{ value: 'desc', label: 'Descending' }, { value: 'asc', label: 'Ascending' }],
  }
  function change(field, value) { setValues(previous => ({ ...previous, [field]: value })); setErrors(previous => ({ ...previous, [field]: null })) }
  return <>
    <form noValidate onSubmit={event => { event.preventDefault(); generate({ ...values }) }} className="space-y-4 layout-panel">
      <p className="text-sm text-slate-600">Dates select tickets created on inclusive UTC calendar days. {type === 'date-range' ? 'Both dates are required.' : 'Leave dates blank for all dates; either boundary may be used alone.'} Displayed ticket timestamps use your local timezone.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{reportTypes[type].fields.map(field => <div key={field} className="min-w-0">
        <label className="text-sm font-semibold" htmlFor={`report-${field}`}>{labels[field]}{type === 'date-range' ? ' *' : ''}</label>
        {lookups[field] ? <LookupSelect field={field} value={values[field]} disabled={loading} onChange={value => change(field, value)} /> : options[field] ? <select id={`report-${field}`} className={input} disabled={loading} value={values[field]} onChange={event => change(field, event.target.value)}>{field === 'status' && <option value="">All statuses</option>}{options[field].map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select> : <input id={`report-${field}`} className={input} type={field === 'search' ? 'search' : 'date'} maxLength={field === 'search' ? 100 : undefined} min={field === 'search' ? undefined : '1000-01-01'} max={field === 'endDate' ? '9999-12-30' : field === 'startDate' ? '9999-12-31' : undefined} required={type === 'date-range'} value={values[field]} disabled={loading} onChange={event => change(field, event.target.value)} aria-invalid={Boolean(errors[field])} aria-describedby={`report-${field}-error`} />}
        <p id={`report-${field}-error`} className="mt-1 text-sm text-red-700" role={errors[field] ? 'alert' : undefined}>{errors[field]}</p>
      </div>)}</div>
      {type === 'tickets' && <p className="text-sm text-slate-500">Search ticket number, title, requester or technician name/email.</p>}
      <div className="layout-actions"><button type="submit" className={button} disabled={loading}>{loading ? 'Generating report...' : 'Generate Report'}</button><button type="button" className={button} disabled={loading} onClick={() => { setValues(initial()); setErrors({}) }}>Clear filters</button></div>
    </form>
    {loading && <p role="status">Generating report...</p>}
    {error && <div className="space-y-3"><AuthFeedback>{error}</AuthFeedback>{lastRequest && <button className={button} disabled={loading} onClick={() => generate(lastRequest.criteria, lastRequest.page)}>Retry</button>}</div>}
    {result && <section className="min-w-0 space-y-4 layout-panel" aria-busy={loading}>
      <h2 className="text-lg font-semibold">{reportTypes[type].label} results</h2>
      <ReportExportActions key={JSON.stringify(result.criteria)} type={type} criteria={result.criteria} disabled={loading || Boolean(changed) || Boolean(error) || Object.values(errors).some(Boolean)} />
      {(changed || error) && <p role="status" className="text-sm text-amber-800">Showing the last successful report. Generate again to apply the current criteria.</p>}
      <ReportResults type={type} report={result.report} />
      {type === 'tickets' && <nav aria-label="Report pages" className="flex flex-wrap items-center gap-3"><button className={button} disabled={loading || changed || result.report.pagination.page <= 1} onClick={() => generate(result.criteria, result.report.pagination.page - 1)}>Previous</button><p className="text-sm">Page {result.report.pagination.page} of {Math.max(1, result.report.pagination.totalPages)}</p><button className={button} disabled={loading || changed || result.report.pagination.page >= result.report.pagination.totalPages} onClick={() => generate(result.criteria, result.report.pagination.page + 1)}>Next</button></nav>}
    </section>}
  </>
}
function LookupSelect({ field, value, disabled, onChange }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    lookups[field](controller.signal).then(rows => { if (!controller.signal.aborted) setResult({ rows, attempt }) }).catch(() => { if (!controller.signal.aborted) setResult({ error: true, attempt }) })
    return () => controller.abort()
  }, [field, attempt])
  const current = result?.attempt === attempt ? result : null
  return <><select id={`report-${field}`} className={input} disabled={disabled || !current || current.error} value={value} onChange={event => onChange(event.target.value)}><option value="">{!current ? 'Loading options...' : 'All'}</option>{current?.rows?.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select>{current?.error && <div className="mt-2 space-y-2"><p role="alert" className="text-sm">Unable to load {labels[field].toLowerCase()} options.</p><button type="button" className={button} disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Retry options</button></div>}</>
}
