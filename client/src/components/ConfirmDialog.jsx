import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', variant = 'default', pending = false, pendingLabel = 'Updating...', onConfirm, onCancel, children }) {
  const dialog = useRef(null)
  const cancel = useRef(null)
  const locked = useRef(false)
  const [running, setRunning] = useState(false)
  const id = useId()
  const busy = pending || running
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    const trigger = document.activeElement
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    cancel.current?.focus()
    return () => {
      element.close()
      document.body.style.overflow = overflow
      if (trigger?.isConnected) trigger.focus()
    }
  }, [open])
  async function confirm() {
    if (busy || locked.current) return
    locked.current = true
    setRunning(true)
    try { await onConfirm() } finally { locked.current = false; setRunning(false) }
  }
  if (!open) return null
  const color = variant === 'destructive' ? 'bg-red-700 hover:bg-red-800' : variant === 'warning' ? 'bg-amber-800 hover:bg-amber-900' : 'bg-teal-700 hover:bg-teal-800'
  const button = 'min-h-11 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
  return createPortal(<dialog ref={dialog} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-slate-950/50 sm:p-6">
    <h2 id={`${id}-title`} className="break-words text-xl font-semibold">{title}</h2>
    <p id={`${id}-description`} className="mt-3 break-words text-sm text-slate-700">{description}</p>
    {children && <div className="mt-4 min-w-0 space-y-3 break-words">{children}</div>}
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
      <button ref={cancel} type="button" disabled={busy} onClick={onCancel} className={`${button} border border-slate-300 hover:bg-slate-50`}>{cancelLabel}</button>
      <button type="button" disabled={busy} onClick={confirm} className={`${button} ${color} text-white`}>{busy ? pendingLabel : confirmLabel}</button>
    </div>
  </dialog>, document.body)
}
