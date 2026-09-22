import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getTechnicianStatisticsSection } from '../../api/dashboardApi'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketStatus, formatTicketPriority } from '../employee/ticketFormatting'

const buttonClass = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2'
const sections = [['status', 'Workload by status'], ['priority', 'Workload by priority'], ['response', 'First-response performance'], ['resolution', 'Resolution performance'], ['sla', 'SLA summary']]

export default function TechnicianWorkloadPage() {
  const { user } = useAuth()
  const [revision, setRevision] = useState(0)
  return <div className="space-y-6">
    <header className="space-y-3"><h1 className="text-2xl font-semibold">My Workload &amp; Statistics</h1>
      <p className="text-slate-600">Statistics for tickets currently assigned to you, across all dates. Reassigned tickets are not included.</p>
      <div className="flex flex-wrap gap-3"><Link className={buttonClass} to="/technician/tickets/assigned">View My Assigned Tickets</Link><button type="button" className={buttonClass} onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
    </header>
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">{sections.map(([kind, title]) => <StatisticsSection key={`${user?.id}:${kind}:${revision}`} kind={kind} title={title} />)}</div>
  </div>
}

function StatisticsSection({ kind, title }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getTechnicianStatisticsSection(kind, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ data, attempt })
    }).catch(() => { if (!controller.signal.aborted) setResult({ error: true, attempt }) })
    return () => controller.abort()
  }, [kind, attempt])
  const current = result?.attempt === attempt ? result : null
  return <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    {!current ? <p role="status">Loading workload statistics...</p> : current.error ? <><AuthFeedback>Unable to load workload statistics.</AuthFeedback><button type="button" className={buttonClass} onClick={() => setAttempt(value => value + 1)}>Retry</button></> : <StatisticsContent kind={kind} data={current.data} />}
  </section>
}

function StatisticsContent({ kind, data }) {
  if (kind === 'status' || kind === 'priority') {
    const total = data.reduce((sum, row) => sum + row.count, 0)
    if (!total) return <p>No workload statistics are available yet.</p>
    const active = kind === 'status' ? data.filter(row => ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'].includes(row.status)).reduce((sum, row) => sum + row.count, 0) : null
    return <>
      {kind === 'status' && <dl className="grid gap-4 sm:grid-cols-2"><div><dt>Total assigned (all statuses)</dt><dd className="text-2xl font-semibold">{total}</dd></div><div><dt>Active</dt><dd className="text-2xl font-semibold">{active}</dd></div></dl>}
      <dl className="space-y-3">{data.map(row => <div key={row.status || row.priorityId} className="flex flex-wrap justify-between gap-3 border-b border-slate-100 pb-2"><dt>{kind === 'status' ? formatTicketStatus(row.status) : formatTicketPriority(row.priorityName)}</dt><dd className="font-semibold tabular-nums">{row.count}</dd></div>)}</dl>
    </>
  }
  if (kind === 'response' || kind === 'resolution') {
    const minutes = kind === 'response' ? data.averageFirstResponseMinutes : data.averageResolutionMinutes
    const count = kind === 'response' ? data.respondedTickets : data.resolvedTickets
    return <><p className="text-2xl font-semibold">{minutes === null ? 'No workload statistics are available yet.' : `${minutes.toLocaleString(undefined, { maximumFractionDigits: 2 })} minutes`}</p><p className="text-sm text-slate-600">Average elapsed time from ticket creation. Based on {count} {kind === 'response' ? 'responded' : 'resolved'} tickets.</p></>
  }
  return <><p className="text-sm text-slate-600">Compliance covers completed milestones only. Pending milestones may already be overdue.</p><div className="grid gap-6 sm:grid-cols-2">{['response', 'resolution'].map(target => <div key={target}><h3 className="font-semibold">{target === 'response' ? 'First response' : 'Resolution'}</h3>{data[target].trackedTickets === 0 ? <p className="mt-2 text-sm">No SLA statistics are available yet.</p> : <dl className="mt-3 space-y-2">{[['Tracked', 'trackedTickets'], ['Met', 'metTickets'], ['Missed', 'missedTickets'], ['Pending', 'pendingTickets'], ['Completed', 'completedTickets']].map(([label, field]) => <div key={field} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold">{data[target][field]}</dd></div>)}<div className="flex flex-wrap justify-between gap-3"><dt>Compliance</dt><dd className="font-semibold">{data[target].compliancePercentage === null ? 'Not available' : `${data[target].compliancePercentage}%`}</dd></div></dl>}</div>)}</div></>
}
