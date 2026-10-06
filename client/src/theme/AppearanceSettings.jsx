import { useTheme } from './ThemeContext'

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  return <section aria-labelledby="appearance-heading" className="mt-6 layout-panel">
    <h2 id="appearance-heading" className="text-lg font-semibold">Appearance</h2>
    <label htmlFor="appearance-theme" className="mt-4 block text-sm font-medium">Theme</label>
    <select id="appearance-theme" value={theme} onChange={event => setTheme(event.target.value)} className="mt-2 block min-h-11 w-full max-w-sm cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 sm:text-sm">
      <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
    </select>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">System follows your device’s appearance. Your choice is saved on this browser.</p>
  </section>
}
