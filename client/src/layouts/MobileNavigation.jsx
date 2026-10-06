import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { dialogTabStops, restoreFocus } from '../components/focusManagement'
import { lockBodyScroll } from '../components/lockBodyScroll'
import LogoutButton from '../auth/LogoutButton'
import NavigationLinks from './NavigationLinks'
import NavigationIcon from './NavigationIcon'

export default function MobileNavigation({ id, role, displayName, items, open, onClose, trigger }) {
  const dialog = useRef(null)
  const closeButton = useRef(null)
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    const triggerElement = trigger.current
    // Match Tailwind's existing lg breakpoint; never leave an invisible modal open.
    const desktop = window.matchMedia('(min-width: 64rem)')
    if (desktop.matches) { onClose(); return }
    element.showModal()
    const unlock = lockBodyScroll()
    closeButton.current?.focus({ preventScroll: true })
    function resize(event) { if (event.matches) onClose() }
    desktop.addEventListener('change', resize)
    return () => {
      desktop.removeEventListener('change', resize)
      element.close()
      unlock()
      restoreFocus(triggerElement)
    }
  }, [open, onClose, trigger])

  function trapTab(event) {
    if (event.key !== 'Tab') return
    const stops = dialogTabStops(dialog.current)
    const first = stops[0], last = stops[stops.length - 1]
    if (event.shiftKey && (document.activeElement === first || !stops.includes(document.activeElement))) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || !stops.includes(document.activeElement))) { event.preventDefault(); first?.focus() }
  }
  function backdrop(event) {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  }
  if (typeof document === 'undefined') return null
  return createPortal(<dialog id={id} ref={dialog} tabIndex={-1} aria-modal="true" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose() }} onClick={backdrop} onKeyDown={trapTab} className="mobile-navigation [overflow-wrap:anywhere] fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[85vw] max-w-xs overflow-hidden border-0 border-r border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:backdrop:bg-black/70 lg:hidden">
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="min-w-0"><p id={`${id}-title`} className="text-xl font-bold tracking-tight text-teal-800 dark:text-teal-300">SupportFlow</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{role} workspace</p></div>
        <button ref={closeButton} type="button" aria-label="Close navigation menu" onClick={onClose} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"><NavigationIcon close /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <nav aria-label={`${role} navigation`}><NavigationLinks items={items} onNavigate={onClose} /></nav>
        <div className="mt-6 border-t border-slate-200 px-3 pb-3 pt-4 dark:border-slate-700">
          <p className="break-words text-sm font-medium">{displayName}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{role}</p>
          <div className="[&_button]:min-h-11"><LogoutButton onLogout={onClose} /></div>
        </div>
      </div>
    </div>
  </dialog>, document.body)
}
