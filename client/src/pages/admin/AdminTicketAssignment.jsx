import { useEffect, useId, useRef, useState } from 'react'
import { assignTicket, unassignTicket } from '../../api/ticketApi'
import { getAssignableTechnicians, getTechnicianWorkloads } from '../../api/userApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

const button = 'min-h-11 w-fit cursor-pointer rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700'
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
    <label htmlFor={id} className="block text-sm font-medium">Technician</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={isOpen} aria-controls={`${id}-list`} aria-activedescendant={isOpen && options[active] ? `${id}-option-${active}` : undefined} autoComplete="off" className={input} disabled={disabled} placeholder="Search or select a technician..." value={isOpen ? query : chosen ? name(chosen) : ''} onFocus={open} onClick={open} onKeyDown={keyDown} onChange={event => { setQuery(event.target.value); setExpanded(true); setActive(-1); onSelect('') }} />
    {isOpen && <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg">
      <ul id={`${id}-list`} role="listbox" aria-label="Assignable technicians" ref={list}>{options.map((person, index) => {
        const current = String(person.id) === String(currentId)
        return <li id={`${id}-option-${index}`} key={person.id} role="option" aria-selected={String(person.id) === selected} aria-disabled={current} className={`min-w-0 break-words p-3 text-sm ${current ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-teal-50'} ${active === index ? 'bg-teal-50 ring-1 ring-inset ring-teal-700' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => select(person)}>
          <p className="font-semibold">{name(person)}{current ? ' (Current technician)' : ''}</p>
          {person.email && <p className="break-all text-slate-600">{person.email}</p>}
          {counts.has(String(person.id)) && <p className="text-slate-600">{counts.get(String(person.id))} active tickets</p>}
        </li>
      })}</ul>
      {!options.length && <p role="status" className="p-3 text-sm text-slate-600">No technicians found.</p>}
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
      setNotice({ success: true, text: 'Ticket unassigned successfully.' })
      await refresh()
    } catch (error) {
      if (!mounted.current) return
      const message = error?.response?.data?.message
      const safe = ['Ticket assignment has changed. Refresh and try again.', 'Ticket is already unassigned', 'Ticket cannot be unassigned in its current status', 'Ticket not found']
      setNotice({ success: false, text: safe.includes(message) ? message : getApiErrorMessage(error, 'Unable to unassign ticket. Please try again.') })
      await refresh()
    } finally {
      pending.current = false
      if (mounted.current) { setBusy(false); setUnassignConfirmation(null) }
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
  return <section aria-labelledby="assignment-heading" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 id="assignment-heading" className="text-lg font-semibold">Assignment</h2>
    <dl><dt className="text-sm text-slate-500">Current technician</dt><dd className="mt-1 break-words">{assigned ? name(ticket.assignee) : 'Unassigned'}</dd></dl>
    {notice && <AuthFeedback variant={notice.success ? 'success' : 'error'}>{notice.text}</AuthFeedback>}
    {unassignConfirmation ? <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="font-medium">Unassign this ticket from {unassignConfirmation.name}?</p>
      <p className="text-sm">The ticket will return to Open with no assigned technician. Assignment history will be retained and the removed technician will be notified.</p>
      <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => setUnassignConfirmation(null)}>Cancel</button><button type="button" className={`${button} border-red-700 text-red-700 hover:bg-red-50`} disabled={busy} onClick={removeAssignment}>{busy ? 'Unassigning...' : 'Confirm Unassign'}</button></div>
    </div> : <div className="flex flex-wrap items-start gap-3">
    {!eligible ? <p className="text-sm text-slate-600">Assignment cannot be changed on resolved or closed tickets.</p> : !open ? <button className={button} disabled={busy} onClick={() => { setOpen(true); setAttempt(value => value + 1); setSelected(''); setConfirm(false) }}>{assigned ? 'Reassign' : 'Assign technician'}</button> : <div className="w-full min-w-0 max-w-lg space-y-3">
      {!current && <p role="status">Loading technicians...</p>}
      {current?.error && <><AuthFeedback>Unable to load technicians.</AuthFeedback><button className={button} onClick={() => setAttempt(value => value + 1)}>Retry</button></>}
      {current?.data && <>
        {!current.data.length ? <p>No assignable technicians found.</p> : <>
          <TechnicianCombobox technicians={current.data} counts={counts} selected={selected} currentId={ticket.assignedTo} disabled={busy || confirm} onSelect={value => { setSelected(value); setConfirm(false) }} />
          {workload?.error && <p className="text-sm text-slate-600">Workload counts are unavailable. You can still choose a technician.</p>}
          {confirm && chosen && <p>{assigned ? `Reassign this ticket from ${name(ticket.assignee)} to ${name(chosen)}?` : `Assign this ticket to ${name(chosen)}?`}</p>}
        </>}
      </>}
      <div className="flex flex-wrap gap-3">
      {current?.data?.length > 0 && <button className={button} disabled={busy || !chosen || !canConfirmAssignment(ticket, selected)} onClick={() => confirm ? save() : setConfirm(true)}>{busy ? assigned ? 'Reassigning...' : 'Assigning...' : confirm ? 'Confirm' : 'Continue'}</button>}
      <button className={button} disabled={busy} onClick={() => { setOpen(false); setConfirm(false) }}>Cancel</button>
      </div>
    </div>}
    {!open && canUnassign && <button type="button" className={`${button} border-red-700 text-red-700 hover:bg-red-50`} disabled={busy} onClick={() => setUnassignConfirmation({ id: ticket.assignment.id, name: name(ticket.assignee) })}>Unassign</button>}
    </div>}
  </section>
}
