import { StatusBadge, PriorityBadge, ActiveBadge } from '../../components/Badges'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import SummaryCard from '../../layouts/SummaryCard'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAdminAnalyticsSection } from '../../api/dashboardApi'
import { formatTicketPriority, formatTicketStatus } from '../employee/ticketFormatting'
import { formatAnalyticsMinutes } from './analyticsFormatting'

const button = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2'
export default function AdminAnalyticsPage() {
  const [revision, setRevision] = useState(0)
  const [period, setPeriod] = useState('monthly')
  const [initialView, setInitialView] = useState(true)
  return <div className="layout-page">
    <PageHeader title="Analytics Dashboard" description="Organization-wide support metrics across all dates, except the created-ticket trend's selected period." actions={<><button className={button} onClick={() => { setInitialView(false); setRevision(value => value + 1) }}>Refresh analytics</button></>} />
    <AnalyticsSection initialView={initialView} key={`summary:${revision}`} kind="summary" title="Ticket overview" />
    <section className="space-y-3"><label htmlFor="analytics-period" className="block text-sm font-semibold">Created-ticket trend period</label><select id="analytics-period" className="min-h-11 w-full max-w-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400" value={period} onChange={event => { setInitialView(false); setPeriod(event.target.value) }}><option value="monthly">Last 12 months (UTC)</option><option value="daily">Last 30 days (UTC)</option></select><AnalyticsSection initialView={initialView} key={`trend:${period}:${revision}`} kind="trend" title="Created-ticket trend" period={period} /></section>
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">{[['status', 'Ticket status distribution'], ['priority', 'Ticket priority distribution'], ['category', 'Tickets by category'], ['response', 'Average first-response time'], ['resolution', 'Average resolution time'], ['satisfaction', 'Support satisfaction']].map(([kind, title]) => <AnalyticsSection initialView={initialView} key={`${kind}:${revision}`} kind={kind} title={title} />)}</div>
    <AnalyticsSection initialView={initialView} key={`sla:${revision}`} kind="sla" title="SLA compliance" />
    <AnalyticsSection initialView={initialView} key={`workload:${revision}`} kind="workload" title="Technician workload" />
  </div>
}
function AnalyticsSection({ kind, title, period, initialView }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getAdminAnalyticsSection(kind, { signal: controller.signal, period }).then(data => {
      if (!controller.signal.aborted) setResult({ data, attempt })
    }).catch(() => { if (!controller.signal.aborted) setResult({ error: true, attempt }) })
    return () => controller.abort()
  }, [kind, period, attempt])
  const current = result?.attempt === attempt ? result : null
  return <section className="min-w-0 space-y-4 layout-panel"><h2 className="text-lg font-semibold">{title}</h2>
    {!current ? <ContentSkeleton initial={initialView && !result && attempt === 0} variant={kind === 'summary' ? 'summary' : ['trend', 'status'].includes(kind) ? 'chart' : 'rows'} count={4}>Loading analytics...</ContentSkeleton> : current.error ? <ErrorState compact title="Unable to load analytics"><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry {title.toLowerCase()}</button></ErrorState> : <AnalyticsContent kind={kind} data={current.data} period={period} />}
  </section>
}
function Values({ rows }) {
  return <dl className="space-y-2">{rows.map(([label, value], index) => <div key={index} className="flex flex-wrap justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2"><dt>{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl>
}
function AnalyticsContent({ kind, data, period }) {
  if (kind === 'summary') return <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Total tickets', 'totalTickets'], ['Active tickets', 'activeTickets'], ['Resolved tickets', 'resolvedTickets'], ['Unassigned tickets', 'unassignedTickets']].map(([label, field]) => <SummaryCard key={field} label={label} value={data[field]} />)}</dl>
  if (['status', 'priority', 'category', 'trend'].includes(kind)) {
    const rows = data.map(row => ({ label: kind === 'status' ? formatTicketStatus(row.status) : kind === 'priority' ? formatTicketPriority(row.priorityName) : kind === 'category' ? row.categoryName : row[period === 'daily' ? 'date' : 'month'], count: row.count }))
    if (!rows.some(row => row.count > 0)) return <EmptyState compact title={kind === 'trend' ? 'No ticket data is available for this period.' : 'No ticket data is available yet.'} />
    return <>
      {kind === 'trend' && <p className="text-sm text-slate-600 dark:text-slate-300">Tickets grouped by creation date in UTC, including the current partial {period === 'daily' ? 'day' : 'month'}. This is not a resolved-ticket trend.</p>}
      {(kind === 'trend' || kind === 'status') && <div className="h-80 min-w-0 w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">{kind === 'trend' ? <LineChart accessibilityLayer={false} data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 15 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" /><XAxis stroke="var(--chart-text)" dataKey="label" minTickGap={35} /><YAxis stroke="var(--chart-text)" allowDecimals={false} /><Tooltip contentStyle={{ backgroundColor: 'var(--chart-surface)', borderColor: 'var(--chart-grid)', color: 'var(--page-text)' }} itemStyle={{ color: 'var(--page-text)' }} cursor={{ stroke: 'var(--chart-grid)', fill: 'var(--chart-grid)', fillOpacity: 0.2 }} /><Line type="monotone" dataKey="count" name="Created tickets" stroke="var(--chart-series)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart> : <BarChart accessibilityLayer={false} data={rows} layout="vertical" margin={{ right: 20, left: 0 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" /><XAxis stroke="var(--chart-text)" type="number" allowDecimals={false} /><YAxis stroke="var(--chart-text)" type="category" dataKey="label" width={125} tick={{ fontSize: 12 }} /><Tooltip contentStyle={{ backgroundColor: 'var(--chart-surface)', borderColor: 'var(--chart-grid)', color: 'var(--page-text)' }} itemStyle={{ color: 'var(--page-text)' }} cursor={{ stroke: 'var(--chart-grid)', fill: 'var(--chart-grid)', fillOpacity: 0.2 }} /><Bar dataKey="count" name="Tickets" fill="var(--chart-series)" isAnimationActive={false} /></BarChart>}</ResponsiveContainer></div>}
      <div role="region" aria-label={`${({ status: 'Ticket status distribution', priority: 'Ticket priority distribution', category: 'Tickets by category', trend: 'Created-ticket trend' })[kind]} data`} tabIndex={0} className="max-h-80 overflow-y-auto"><Values rows={rows.map((row, index) => [kind === 'status' ? <StatusBadge key="status" value={data[index].status} /> : kind === 'priority' ? <PriorityBadge key="priority" value={data[index].priorityName} /> : row.label, row.count])} /></div>
    </>
  }
  if (kind === 'response' || kind === 'resolution') {
    const minutes = kind === 'response' ? data.averageFirstResponseMinutes : data.averageResolutionMinutes
    const count = kind === 'response' ? data.respondedTickets : data.resolvedTickets
    return <><p className="text-3xl font-semibold">{formatAnalyticsMinutes(minutes)}</p><p className="text-sm text-slate-600 dark:text-slate-300">Elapsed time from ticket creation, based on {count} {kind === 'response' ? 'responded' : 'resolved'} tickets. {minutes !== null && `Backend average: ${minutes.toLocaleString()} minutes.`}</p>{minutes === null && <EmptyState compact title="No completed samples available." />}</>
  }
  if (kind === 'sla') return <><p className="text-sm text-slate-600 dark:text-slate-300">Compliance covers completed milestones only. Pending milestones may already be overdue; these counts are not current warning or breach totals.</p><div className="grid gap-6 sm:grid-cols-2">{['response', 'resolution'].map(dimension => <div key={dimension} className="space-y-3"><h3 className="font-semibold">{dimension === 'response' ? 'First response' : 'Resolution'}</h3><>{data[dimension].trackedTickets === 0 ? <EmptyState compact title="No SLA data is available yet." /> : <Values rows={[[ 'Compliance', data[dimension].compliancePercentage === null ? 'Not available' : `${data[dimension].compliancePercentage}%` ], ...[['Tracked milestones', 'trackedTickets'], ['Met', 'metTickets'], ['Missed', 'missedTickets'], ['Pending', 'pendingTickets'], ['Completed', 'completedTickets']].map(([label, field]) => [label, data[dimension][field]])]} />}</></div>)}</div></>
  if (kind === 'satisfaction') return data.totalRatings === 0 ? <EmptyState compact title="No support ratings available yet." /> : <Values rows={[[ 'Average rating', `${data.averageRating} / 5` ], ['Rating count', data.totalRatings], ['Satisfied ratings (4-5)', data.satisfiedRatings], ['Satisfaction', `${data.satisfactionPercentage}%`]]} />
  return <><Link className={button} to="/admin/technicians/workload">View technician workload</Link><p className="text-sm text-slate-600 dark:text-slate-300">Current assigned ticket counts from the server. Includes active and inactive technician accounts.</p>{!data.length ? <EmptyState compact title="No technician workload data available." /> : <div tabIndex={0} aria-label="Scrollable technician workload table" className="max-h-96 layout-table"><table className="w-full text-left text-sm"><caption className="sr-only">Current technician workload</caption><thead><tr>{['Technician', 'Account', 'Active tickets', 'Resolved tickets'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{data.map(row => <tr key={row.technicianId} className="border-t border-slate-200 dark:border-slate-700"><th scope="row" className="p-3 font-medium">{row.technicianName || row.email}</th><td className="p-3"><ActiveBadge value={row.isActive} /></td><td className="p-3">{row.activeTickets}</td><td className="p-3">{row.resolvedTickets}</td></tr>)}</tbody></table></div>}</>
}
