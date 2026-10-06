import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import LoadingState from '../../components/LoadingState'
import { useEffect, useId, useRef, useState } from 'react'
import { assignTicket, unassignTicket } from '../../api/ticketApi'
import { getAssignableTechnicians, getTechnicianWorkloads } from '../../api/userApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

const button = 'min-h-11 w-fit cursor-pointer rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400'
const name = person => [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.email || 'Technician'
const canConfirmAssignment = (ticket, selected) => Boolean(selected) && String(selected) !== String(ticket.assignedTo) && !['RESOLVED', 'CLOSED'].includes(ticket.status)

function TechnicianCombobox({ technicians, counts, selected, currentId, disabled, onSelect }) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const list = useRef(null)
  const chosen = technicians.find(person => String(person.id) === selected)
  const options = technicians.filter(person => `${person.firstName || ''} ${person.lastName || ''} ${person.email || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const isOpen = expanded && !disabled
  useEffect(() => {
    if (isOpen && active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, isOpen])
  function open() { if (!expanded) { setQuery(''); setActive(-1); setExpanded(true) } }
  function select(person) {
    if (String(person.id) === String(currentId)) return
    onSelect(String(person.id)); setExpanded(false); setActive(-1)
  }
  function keyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); setActive(-1) }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) { open(); return }
      const step = event.key === 'ArrowDown' ? 1 : -1
      let next = active
      for (let count = 0; count < options.length; count++) {
        next = (next + step + options.length) % options.length
        if (String(options[next].id) !== String(currentId)) { setActive(next); break }
      }
    }
    if (event.key === 'Enter' && isOpen) { event.preventDefault(); if (options[active]) select(options[active]) }
  }
  return <div className="relative min-w-0" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setExpanded(false); setActive(-1) } }}>
    <label htmlFor={id} className="block text-sm font-medium">Technician *</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={isOpen} aria-controls={`${id}-list`} aria-activedescendant={isOpen && options[active] ? `${id}-option-${active}` : undefined} autoComplete="off" className={input} disabled={disabled} placeholder="Search or select a technician..." value={isOpen ? query : chosen ? name(chosen) : ''} onFocus={open} onClick={open} onKeyDown={keyDown} onChange={event => { setQuery(event.target.value); setExpanded(true); setActive(-1); onSelect('') }} />
    {isOpen && <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-[min(16rem,45dvh)] overflow-y-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
      <ul id={`${id}-list`} role="listbox" aria-label="Assignable technicians" ref={list}>{options.map((person, index) => {
        const current = String(person.id) === String(currentId)
        return <li id={`${id}-option-${index}`} key={person.id} role="option" aria-selected={String(person.id) === selected} aria-disabled={current} className={`min-w-0 break-words p-3 text-sm ${current ? 'cursor-not-allowed text-slate-500 dark:text-slate-400' : 'cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950'} ${active === index ? 'bg-teal-50 dark:bg-teal-950 ring-1 ring-inset ring-teal-700 dark:ring-teal-400' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => select(person)}>
          <p className="font-semibold">{name(person)}{current ? ' (Current technician)' : ''}</p>
          {person.email && <p className="break-all text-slate-600 dark:text-slate-300">{person.email}</p>}
          {counts.has(String(person.id)) && <p className="text-slate-600 dark:text-slate-300">{counts.get(String(person.id))} active tickets</p>}
        </li>
      })}</ul>
      {!options.length && <p role="status" className="p-3 text-sm text-slate-600 dark:text-slate-300">No technicians found.</p>}
    </div>}
  </div>
}

export default function AdminTicketAssignment({ ticket, refresh }) {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [options, setOptions] = useState(null)
  const [workload, setWorkload] = useState(null)
  const [selected, setSelected] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [unassignConfirmation, setUnassignConfirmation] = useState(null)
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
  const canUnassign = assigned && ticket.assignment?.id != null && ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'].includes(ticket.status)
  const current = options?.attempt === attempt ? options : null
  const chosen = current?.data?.find(person => String(person.id) === selected)
  const counts = new Map(workload?.attempt === attempt ? workload.data?.map(person => [String(person.id), person.workload.totalActive]) : [])
  async function removeAssignment() {
    if (pending.current || !unassignConfirmation || !canUnassign) return
    pending.current = true; setBusy(true); setNotice(null)
    try {
      // Keep the ID captured when confirmation opened; never substitute a newer assignment.
      await unassignTicket(ticket.id, unassignConfirmation.id)
      if (!mounted.current) return
      setSelected(''); setConfirm(false); setOpen(false)
      setUnassignConfirmation(null)
      setNotice({ success: true, text: 'Ticket unassigned successfully.' })
      await refresh()
    } catch (error) {
      if (!mounted.current) return
      const message = error?.response?.data?.message
      if ([403, 404, 409].includes(error?.response?.status)) setUnassignConfirmation(null)
      const safe = ['Ticket assignment has changed. Refresh and try again.', 'Ticket is already unassigned', 'Ticket cannot be unassigned in its current status', 'Ticket not found']
      setNotice({ success: false, text: safe.includes(message) ? message : getApiErrorMessage(error, 'Unable to unassign ticket. Please try again.') })
      await refresh()
    } finally {
      pending.current = false
      if (mounted.current) { setBusy(false) }
    }
  }
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
  return <section aria-labelledby="assignment-heading" className="min-w-0 space-y-4 layout-panel">
    <h2 id="assignment-heading" className="text-lg font-semibold">Assignment</h2>
    <dl><dt className="text-sm text-slate-500 dark:text-slate-400">Current technician</dt><dd className="mt-1 break-words">{assigned ? name(ticket.assignee) : 'Unassigned'}</dd></dl>
    {notice && <AuthFeedback variant={notice.success ? 'success' : 'error'}>{notice.text}</AuthFeedback>}
    <ConfirmDialog open={Boolean(unassignConfirmation)} title="Unassign ticket?" description={`Current technician: ${unassignConfirmation?.name}. The ticket will return to Open in the unassigned queue. Assignment history will be retained and the removed technician notified.`} variant="warning" confirmLabel="Unassign Ticket" pending={busy} pendingLabel="Unassigning..." onConfirm={removeAssignment} onCancel={() => setUnassignConfirmation(null)}>{notice && !notice.success && <AuthFeedback>{notice.text}</AuthFeedback>}</ConfirmDialog>
    <div className="flex flex-wrap items-start gap-3">
    {!eligible ? <p className="text-sm text-slate-600 dark:text-slate-300">Assignment cannot be changed on resolved or closed tickets.</p> : !open ? <button className={button} disabled={busy} onClick={() => { setOpen(true); setAttempt(value => value + 1); setSelected(''); setConfirm(false) }}>{assigned ? 'Reassign' : 'Assign technician'}</button> : <div className="w-full min-w-0 max-w-lg space-y-3">
      {!current && <div className="space-y-1" aria-busy="true"><p className="text-sm font-medium">Technician</p><div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3"><LoadingState>Loading technicians...</LoadingState></div></div>}
      {current?.error && <ErrorState compact title="Unable to load technicians"><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry</button></ErrorState>}
      {current?.data && <>
        {!current.data.length ? <EmptyState compact title="No assignable technicians found." /> : <>
          <TechnicianCombobox technicians={current.data} counts={counts} selected={selected} currentId={ticket.assignedTo} disabled={busy || confirm} onSelect={value => { setSelected(value); setConfirm(false) }} />
          {!chosen && <p className="text-sm text-slate-600 dark:text-slate-300">Select an available technician to continue. Reassignment requires a different technician.</p>}
          {workload?.error && <p className="text-sm text-slate-600 dark:text-slate-300">Workload counts are unavailable. You can still choose a technician.</p>}
          <ConfirmDialog open={Boolean(confirm && chosen)} title={assigned ? "Reassign ticket?" : "Assign technician?"} description={assigned ? `Current technician: ${name(ticket.assignee)}. New technician: ${chosen ? name(chosen) : ""}.` : `Assign this ticket to ${chosen ? name(chosen) : "the selected technician"}?`} confirmLabel={assigned ? "Reassign Ticket" : "Assign Technician"} pending={busy} pendingLabel={assigned ? "Reassigning..." : "Assigning..."} onConfirm={save} onCancel={() => setConfirm(false)}>{notice && !notice.success && <AuthFeedback>{notice.text}</AuthFeedback>}</ConfirmDialog>
        </>}
      </>}
      <div className="layout-actions">
      {current?.data?.length > 0 && <button className={button} disabled={busy || !chosen || !canConfirmAssignment(ticket, selected)} onClick={() => { setNotice(null); setConfirm(true) }}>{busy ? assigned ? 'Reassigning...' : 'Assigning...' : confirm ? 'Confirm' : 'Continue'}</button>}
      <button className={button} disabled={busy} onClick={() => { setOpen(false); setConfirm(false) }}>Cancel</button>
      </div>
    </div>}
    {!open && canUnassign && <button type="button" className={`${button} border-red-700 dark:border-red-400 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950`} disabled={busy} onClick={() => { setNotice(null); setUnassignConfirmation({ id: ticket.assignment.id, name: name(ticket.assignee) }) }}>Unassign</button>}
    </div>
  </section>
}
