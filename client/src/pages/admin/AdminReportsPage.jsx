import FilterBar, { ClearFilters } from '../../components/FilterBar'
import Pagination from '../../components/Pagination'
import { focusFirstError } from '../../components/formValidation'
import FieldError from '../../components/FieldError'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ReportSkeleton from './ReportSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useEffect, useRef, useState } from 'react'
import { getReport, reportTypes } from '../../api/reportApi'
import { getCategories } from '../../api/categoryApi'
import { getTicketPriorities } from '../../api/ticketApi'
import { getAdminDashboardSection } from '../../api/dashboardApi'
import { getApiErrorMessage } from '../../api/apiError'
import { ticketStatuses, formatTicketPriority } from '../employee/ticketFormatting'
import { validateReportDates } from './reportValidation'
import ReportResults from './ReportResults'
import ReportExportActions from './ReportExportActions'

const button = 'inline-flex min-h-11 w-fit cursor-pointer items-center justify-center rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:opacity-50'
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
    if (Object.keys(next).length) { focusFirstError(next, field => `report-${field}`); return }
    pending.current = true; setLoading(true)
    const abort = new AbortController()
    controller.current = abort
    setLastRequest({ criteria, page })
    try {
      let report = await getReport(type, criteria, { page, signal: abort.signal })
      while (!abort.signal.aborted && type === 'tickets' && page > Math.max(1, report.pagination.totalPages)) {
        page = Math.max(1, report.pagination.totalPages)
        setLastRequest({ criteria, page })
        report = await getReport(type, criteria, { page, signal: abort.signal })
      }
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
  function change(field, value) { const next = { ...values, [field]: value }; setValues(next); setErrors(previous => previous.startDate || previous.endDate ? validateReportDates(type, next) : { ...previous, [field]: null }) }
  return <>
    <FilterBar activeCount={reportTypes[type].fields.map(field => values[field] !== initial()[field]).filter(Boolean).length} as="form" noValidate onSubmit={event => { event.preventDefault(); generate({ ...values }) }} className="space-y-4 layout-panel">
      <p className="text-sm text-slate-600 dark:text-slate-300">Dates select tickets created on inclusive UTC calendar days. {type === 'date-range' ? 'Both dates are required.' : 'Leave dates blank for all dates; either boundary may be used alone.'} Displayed ticket timestamps use your local timezone.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{reportTypes[type].fields.map(field => <div key={field} className="min-w-0">
        <label className="text-sm font-semibold" htmlFor={`report-${field}`}>{labels[field]}{type === 'date-range' ? ' *' : ''}</label>
        {lookups[field] ? <LookupSelect field={field} value={values[field]} disabled={loading} onChange={value => change(field, value)} /> : options[field] ? <select id={`report-${field}`} className={input} disabled={loading} value={values[field]} onChange={event => change(field, event.target.value)}>{field === 'status' && <option value="">All statuses</option>}{options[field].map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select> : <input id={`report-${field}`} className={input} placeholder={field === 'search' ? 'Search tickets...' : undefined} type={field === 'search' ? 'search' : 'date'} maxLength={field === 'search' ? 100 : undefined} min={field === 'search' ? undefined : '1000-01-01'} max={field === 'endDate' ? '9999-12-30' : field === 'startDate' ? '9999-12-31' : undefined} required={type === 'date-range'} value={values[field]} disabled={loading} onChange={event => change(field, event.target.value)} onBlur={() => { if (field.endsWith('Date')) setErrors(validateReportDates(type, values)) }} aria-invalid={Boolean(errors[field])} aria-describedby={`report-${field}-error`} />}
        <FieldError id={`report-${field}-error`}>{errors[field]}</FieldError>
      </div>)}</div>
      {type === 'tickets' && <p className="text-sm text-slate-500 dark:text-slate-400">Search ticket number, title, requester or technician name/email.</p>}
      {Object.keys(validateReportDates(type, values)).length > 0 && <p className="text-sm text-slate-600 dark:text-slate-300">Enter valid report dates, with the end date on or after the start date, to generate a report.</p>}
      <div className="layout-actions"><button type="submit" className={button} disabled={loading || Object.keys(validateReportDates(type, values)).length > 0}>{loading ? 'Generating report...' : 'Generate Report'}</button><ClearFilters disabled={loading || !reportTypes[type].fields.some(field => values[field] !== initial()[field])} onClick={() => { setValues(initial()); setErrors({}) }} /></div>
    </FilterBar>
    {!loading && !result && !error && <EmptyState title="Generate a report" message="Choose a report type and criteria, then generate a report." />}
    {loading && <ReportSkeleton type={type} initial={!result} />}
    {error && <ErrorState title="Unable to generate report" message={<>{error}</>}>{lastRequest && <button className={button} disabled={loading} onClick={() => generate(lastRequest.criteria, lastRequest.page)}>Retry</button>}</ErrorState>}
    {result && <section className="min-w-0 space-y-4 layout-panel" aria-busy={loading}>
      <h2 className="text-lg font-semibold">{reportTypes[type].label} results</h2>
      <ReportExportActions key={JSON.stringify(result.criteria)} type={type} criteria={result.criteria} disabled={loading || Boolean(changed) || Boolean(error) || Object.values(errors).some(Boolean)} />
      {(changed || error) && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">Showing the last successful report. Generate again to apply the current criteria.</p>}
      <ReportResults type={type} report={result.report} />
      {type === 'tickets' && <Pagination metadata={result.report.pagination} noun="tickets" label="Report results" isLoading={loading} disabled={Boolean(changed) || Boolean(error) || Object.values(errors).some(Boolean)} onPageChange={page => generate(result.criteria, page)} />}
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
  return <><select id={`report-${field}`} className={input} disabled={disabled || !current || current.error} value={value} onChange={event => onChange(event.target.value)}><option value="">{!current ? 'Loading options...' : ({ categoryId: 'All categories', priorityId: 'All priorities', technicianId: 'All technicians' })[field]}</option>{current?.rows?.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select>{current?.error && <ErrorState compact className="mt-2" title={<>Unable to load {labels[field].toLowerCase()} options.</>}><button type="button" className={button} disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Retry options</button></ErrorState>}</>
}
