import { useEffect, useRef, useState } from 'react'
import { assignTicket } from '../../api/ticketApi'
import { getAssignableTechnicians, getTechnicianWorkloads } from '../../api/userApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

const button = 'min-h-11 w-fit cursor-pointer rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700'
const name = person => [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.email || 'Technician'
const canConfirmAssignment = (ticket, selected) => Boolean(selected) && String(selected) !== String(ticket.assignedTo) && !['RESOLVED', 'CLOSED'].includes(ticket.status)

export default function AdminTicketAssignment({ ticket, refresh }) {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [options, setOptions] = useState(null)
  const [workload, setWorkload] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const pending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    getAssignableTechnicians({ signal: controller.signal }).then(data => { if (!controller.signal.aborted) setOptions({ attempt, data }) }).catch(() => { if (!controller.signal.aborted) setOptions({ attempt, error: true }) })
    getTechnicianWorkloads({ signal: controller.signal }).then(data => { if (!controller.signal.aborted) setWorkload({ attempt, data }) }).catch(() => { if (!controller.signal.aborted) setWorkload({ attempt, error: true }) })
    return () => controller.abort()
  }, [open, attempt])
  const assigned = ticket.assignedTo != null
  const eligible = !['RESOLVED', 'CLOSED'].includes(ticket.status)
  const current = options?.attempt === attempt ? options : null
  const chosen = current?.data?.find(person => String(person.id) === selected)
  const counts = new Map(workload?.attempt === attempt ? workload.data?.map(person => [String(person.id), person.workload.totalActive]) : [])
  const visible = current?.data?.filter(person => String(person.id) === selected || `${name(person)} ${person.email || ''}`.toLowerCase().includes(search.trim().toLowerCase())) || []
  async function save() {
    if (pending.current || !confirm || !chosen || !canConfirmAssignment(ticket, selected)) return
    pending.current = true; setBusy(true); setNotice(null)
    try {
      await assignTicket(ticket.id, chosen.id)
      if (!mounted.current) return
      setOpen(false); setConfirm(false); setSelected('')
      setNotice({ success: true, text: assigned ? 'Ticket reassigned successfully.' : 'Ticket assigned successfully.' })
      await refresh()
    } catch (error) {
      if (!mounted.current) return
      const safeMessages = ['Selected technician is inactive', 'Selected user is not a technician', 'Technician not found', 'Ticket not found', 'Ticket cannot be assigned in its current status']
      const message = error?.response?.data?.message
      setNotice({ success: false, text: safeMessages.includes(message) ? message : getApiErrorMessage(error, 'Unable to assign ticket. Please try again.') })
      setConfirm(false); setAttempt(value => value + 1)
      await refresh()
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <section aria-labelledby="assignment-heading" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 id="assignment-heading" className="text-lg font-semibold">Assignment</h2>
    <dl><dt className="text-sm text-slate-500">Current technician</dt><dd className="mt-1 break-words">{assigned ? name(ticket.assignee) : 'Unassigned'}</dd></dl>
    {notice && <AuthFeedback variant={notice.success ? 'success' : 'error'}>{notice.text}</AuthFeedback>}
    {!eligible ? <p className="text-sm text-slate-600">Assignment cannot be changed on resolved or closed tickets.</p> : !open ? <button className={button} disabled={busy} onClick={() => { setOpen(true); setAttempt(value => value + 1); setSelected(''); setConfirm(false) }}>{assigned ? 'Reassign' : 'Assign technician'}</button> : <div className="space-y-3">
      {!current && <p role="status">Loading technicians...</p>}
      {current?.error && <><AuthFeedback>Unable to load technicians.</AuthFeedback><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry</button></>}
      {current?.data && <>
        {!current.data.length ? <p>No assignable technicians found.</p> : <>
          <label className="block text-sm font-medium">Search technicians<input className={input} disabled={busy || confirm} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label className="block text-sm font-medium">Technician<select className={input} disabled={busy || confirm} value={selected} onChange={event => { setSelected(event.target.value); setConfirm(false) }}><option value="">Select a technician</option>{visible.map(person => <option key={person.id} value={person.id}>{name(person)}{person.email ? ` — ${person.email}` : ''}{counts.has(String(person.id)) ? ` — ${counts.get(String(person.id))} active tickets` : ''}{String(person.id) === String(ticket.assignedTo) ? ' (Current)' : ''}</option>)}</select></label>
          {workload?.error && <p className="text-sm text-slate-600">Workload counts are unavailable. You can still choose a technician.</p>}
          {confirm && chosen && <p>{assigned ? `Reassign this ticket from ${name(ticket.assignee)} to ${name(chosen)}?` : `Assign this ticket to ${name(chosen)}?`}</p>}
          <button className={button} disabled={busy || !chosen || !canConfirmAssignment(ticket, selected)} onClick={() => confirm ? save() : setConfirm(true)}>{busy ? assigned ? 'Reassigning...' : 'Assigning...' : confirm ? 'Confirm' : 'Continue'}</button>
        </>}
      </>}
      <button className={`${button} ml-3`} disabled={busy} onClick={() => { setOpen(false); setConfirm(false) }}>Cancel</button>
    </div>}
  </section>
}
