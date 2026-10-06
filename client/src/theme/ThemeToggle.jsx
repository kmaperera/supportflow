import { useEffect, useId, useRef, useState } from 'react'
import { useTheme } from './ThemeContext'
import ThemeIcon from './ThemeIcon'
import { themeOptions } from './theme'

const button = 'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:outline-teal-400'

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const container = useRef(null)
  const trigger = useRef(null)
  const firstOption = useRef(null)
  const id = useId()
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  useEffect(() => {
    if (!open) return
    firstOption.current?.focus()
    const outside = event => { if (!container.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function close() { setOpen(false); trigger.current?.focus() }
  return <div ref={container} className="relative shrink-0" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() } }}>
    <div className="flex rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button type="button" className={button} title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`} onClick={() => setTheme(next)}><ThemeIcon name={resolvedTheme} /></button>
      <button ref={trigger} type="button" className={button} title="Change appearance" aria-label="Change appearance" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><ThemeIcon name="chevron" className="h-4 w-4" /></button>
    </div>
    {open && <div id={id} role="group" aria-label="Appearance" className="absolute left-0 top-full z-40 mt-2 w-48 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:right-0 sm:left-auto">
      <p className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Appearance</p>
      {themeOptions.map(({ value, label }, index) => <button ref={index === 0 ? firstOption : undefined} key={value} type="button" aria-pressed={theme === value} onClick={() => { setTheme(value); close() }} className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 ${theme === value ? 'bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
        <ThemeIcon name={value} /><span className="flex-1">{label}</span>{theme === value && <ThemeIcon name="check" className="h-4 w-4" />}
      </button>)}
    </div>}
  </div>
}
