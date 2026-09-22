import { useEffect, useState } from 'react'
import { formatTicketDate } from '../employee/ticketFormatting'
import { formatRemaining, parseSlaTimestamp } from './slaTiming'
import { getSlaDisplayState } from './slaDisplayState'

function useSlaClock(deadline, active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || deadline === null || deadline < Date.now()) return
    const interval = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current > deadline) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [deadline, active])
  return now
}

function TimingCard({ title, dueAt, completedAt, completedLabel, timestampLabel, stopped, createdAt, recordedBreach }) {
  const deadline = parseSlaTimestamp(dueAt)
  const completed = parseSlaTimestamp(completedAt)
  const completionProvided = completedAt != null && completedAt !== ''
  const now = useSlaClock(deadline, !stopped && !completionProvided)
  const state = getSlaDisplayState({ created: parseSlaTimestamp(createdAt), deadline, completed, completionProvided, stopped, recordedBreach, now })
  const label = { breached: completed !== null ? `${completedLabel} — SLA breached` : 'SLA Breached', met: `${completedLabel} within SLA`, warning: 'SLA Warning', 'on-track': 'On Track', unavailable: 'No SLA data available' }[state]
  const style = state === 'breached' ? 'border-2 border-red-700 bg-red-50 text-red-900' : state === 'warning' ? 'border border-amber-500 bg-amber-50 text-amber-950' : 'border border-slate-200 bg-slate-50'
  return <div className={`min-w-0 rounded-xl p-4 ${style}`}>
    <h3 className="font-semibold">{title}</h3>
    <p className="mt-2 break-words text-sm font-semibold">{label}</p>
    {state === 'warning' && <p className="mt-1 text-sm">{title === 'Response SLA' ? 'Response' : 'Resolution'} deadline is approaching.</p>}
    {completed !== null ? <>
      <p className="mt-2 font-semibold">{completedLabel}</p>
      <p className="mt-1 text-sm">{timestampLabel}: {formatTicketDate(new Date(completed).toISOString())}</p>
    </> : stopped ? <p className="mt-2 text-sm">Timer stopped. Completion time unavailable.</p>
      : deadline !== null && !completionProvided ? <p className="mt-2 font-semibold tabular-nums">{formatRemaining(deadline, now)}</p> : null}
    <p className="mt-2 text-sm text-slate-600">{deadline !== null ? `Due: ${formatTicketDate(new Date(deadline).toISOString())}` : 'No SLA deadline available'}</p>
  </div>
}

export default function TicketSlaTimers({ ticket }) {
  const stopped = ['RESOLVED', 'CLOSED'].includes(ticket.status)
  return <section aria-labelledby="sla-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 id="sla-heading" className="text-lg font-semibold">SLA</h2>
    <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
      <TimingCard key={`response:${ticket.id}:${ticket.responseDueAt}:${ticket.firstResponseAt}:${ticket.status}`} title="Response SLA" createdAt={ticket.createdAt} recordedBreach={ticket.slaResponseBreached} dueAt={ticket.responseDueAt} completedAt={ticket.firstResponseAt} completedLabel="Responded" timestampLabel="First response" stopped={stopped} />
      <TimingCard key={`resolution:${ticket.id}:${ticket.resolutionDueAt}:${ticket.resolvedAt}:${ticket.status}`} title="Resolution SLA" createdAt={ticket.createdAt} recordedBreach={ticket.slaResolutionBreached} dueAt={ticket.resolutionDueAt} completedAt={ticket.resolvedAt} completedLabel="Resolved" timestampLabel="Resolved at" stopped={stopped} />
    </div>
  </section>
}
