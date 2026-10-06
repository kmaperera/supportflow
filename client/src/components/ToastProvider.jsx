import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ToastContext } from './toastContext'

const styles = {
  success: 'border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950 text-teal-950 dark:text-teal-200',
  error: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-950 dark:text-red-200',
  info: 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 text-sky-950 dark:text-sky-200',
  warning: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-950 dark:text-amber-200',
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const recent = useRef(new Map())
  const sequence = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const dismiss = useCallback(id => {
    if (mounted.current) setToasts(items => items.filter(item => item.id !== id))
  }, [])
  const show = useCallback((type, message) => {
    if (!mounted.current || typeof message !== 'string' || !message.trim()) return
    const key = `${type}:${message}`
    const now = Date.now()
    for (const [entry, time] of recent.current) if (now - time >= 6000) recent.current.delete(entry)
    if (recent.current.has(key)) return
    recent.current.set(key, now)
    const id = ++sequence.current
    setToasts(items => [...items, { id, type, message }].slice(-4))
  }, [])
  const api = useMemo(() => Object.fromEntries(Object.keys(styles).map(type => [type, message => show(type, message)])), [show])
  return <ToastContext.Provider value={api}>
    {children}
    <div aria-label="Notifications" className="pointer-events-none fixed inset-x-3 top-20 z-50 flex flex-col gap-3 sm:left-auto sm:right-5 sm:w-96">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>
}

function ToastItem({ toast, dismiss }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (hovered || focused) return
    const timer = setTimeout(() => dismiss(toast.id), ['error', 'warning'].includes(toast.type) ? 8000 : 5000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.type, dismiss, hovered, focused])
  return <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} className={`pointer-events-auto flex min-w-0 items-start gap-3 rounded-xl border p-4 shadow-lg ${styles[toast.type]}`}>
        <div role={toast.type === 'error' ? 'alert' : 'status'} aria-live={toast.type === 'error' ? 'assertive' : 'polite'} aria-atomic="true" className="min-w-0 flex-1 break-words text-sm">
          <p className="font-semibold capitalize">{toast.type}</p><p className="mt-1">{toast.message}</p>
        </div>
        <button type="button" aria-label={`Dismiss ${toast.type} notification`} onClick={() => dismiss(toast.id)} className="shrink-0 cursor-pointer rounded px-2 py-1 font-semibold hover:bg-white/60 dark:hover:bg-slate-900/60 focus-visible:outline-2 focus-visible:outline-offset-2">×</button>
      </div>
}
