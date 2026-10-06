import { useTheme } from './ThemeContext'
import ThemeIcon from './ThemeIcon'
import { themeOptions } from './theme'

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  return <section aria-labelledby="appearance-heading" className="mt-6 layout-panel">
    <h2 id="appearance-heading" className="text-lg font-semibold">Appearance</h2>
    <div role="group" aria-labelledby="appearance-heading" className="mt-4 grid gap-3 sm:grid-cols-3">
      {themeOptions.map(({ value, label }) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)} className={`flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 ${theme === value ? 'border-teal-700 bg-teal-50 text-teal-900 ring-1 ring-teal-700 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-400' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
        <ThemeIcon name={value} /><span className="flex-1 text-left">{label}</span><span className="h-4 w-4 shrink-0">{theme === value && <ThemeIcon name="check" className="h-4 w-4" />}</span>
      </button>)}
    </div>
    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">System follows your device’s appearance. Your choice is saved on this browser.</p>
  </section>
}
