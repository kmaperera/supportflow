import { useTheme } from './ThemeContext'
import ThemeIcon from './ThemeIcon'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  const next = dark ? 'light' : 'dark'
  return <button type="button" title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`} onClick={() => setTheme(next)} className="relative inline-flex h-11 w-20 shrink-0 cursor-pointer items-center rounded-full border border-slate-300 bg-slate-100 p-1 shadow-sm transition-colors duration-200 hover:border-teal-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-teal-400 dark:hover:bg-slate-700 dark:focus-visible:outline-teal-400 motion-reduce:transition-none">
    <span aria-hidden="true" className={`absolute left-1 top-1 h-8 w-8 rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-200 dark:bg-slate-600 dark:ring-slate-500 motion-reduce:transition-none ${dark ? 'translate-x-9' : 'translate-x-0'}`} />
    <span className={`relative flex h-8 w-8 items-center justify-center ${dark ? 'text-slate-400' : 'text-amber-700'}`}><ThemeIcon name="light" /></span>
    <span className={`relative ml-1 flex h-8 w-8 items-center justify-center ${dark ? 'text-teal-100' : 'text-slate-500'}`}><ThemeIcon name="dark" /></span>
  </button>
}
