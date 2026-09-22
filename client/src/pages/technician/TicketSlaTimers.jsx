import { useEffect, useState } from 'react'
import { formatTicketDate } from '../employee/ticketFormatting'
import { formatRemaining, parseSlaTimestamp } from './slaTiming'

function Countdown({ deadline }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline <= Date.now()) return
    const interval = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [deadline])
  return <p className="mt-2 font-semibold tabular-nums">{formatRemaining(deadline, now)}</p>
}

function TimingCard({ title, dueAt, completedAt, completedLabel, timestampLabel, stopped }) {
  const deadline = parseSlaTimestamp(dueAt)
  const completed = parseSlaTimestamp(completedAt)
  return <div className="min-w-0 rounded-xl bg-slate-50 p-4">
    <h3 className="font-semibold">{title}</h3>
    {completed !== null ? <>
      <p className="mt-2 font-semibold">{completedLabel}</p>
      <p className="mt-1 text-sm">{timestampLabel}: {formatTicketDate(new Date(completed).toISOString())}</p>
    </> : stopped ? <p className="mt-2 text-sm">Timer stopped. Completion time unavailable.</p>
      : deadline !== null ? <Countdown key={deadline} deadline={deadline} /> : null}
    <p className="mt-2 text-sm text-slate-600">{deadline !== null ? `Due: ${formatTicketDate(new Date(deadline).toISOString())}` : 'No SLA deadline available'}</p>
  </div>
}

export default function TicketSlaTimers({ ticket }) {
  const stopped = ['RESOLVED', 'CLOSED'].includes(ticket.status)
  return <section aria-labelledby="sla-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 id="sla-heading" className="text-lg font-semibold">SLA</h2>
    <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
      <TimingCard title="Response SLA" dueAt={ticket.responseDueAt} completedAt={ticket.firstResponseAt} completedLabel="Responded" timestampLabel="First response" stopped={stopped} />
      <TimingCard title="Resolution SLA" dueAt={ticket.resolutionDueAt} completedAt={ticket.resolvedAt} completedLabel="Resolved" timestampLabel="Resolved at" stopped={stopped} />
    </div>
  </section>
}
