import ThemeToggle from '../theme/ThemeToggle'
import NavigationIcon from './NavigationIcon'

export default function WorkspaceHeader({ title, displayName, role, mobileNavigation, menuButtonRef }) {
  return <header className={`min-w-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${mobileNavigation ? 'sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-3 sm:px-6 lg:static lg:z-auto lg:gap-3 lg:px-8 lg:py-4' : 'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8'}`}>
    {mobileNavigation && <div className="flex min-w-0 items-center gap-2 lg:hidden">
      <button ref={menuButtonRef} type="button" aria-label={mobileNavigation.menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavigation.menuOpen} aria-controls={mobileNavigation.id} onClick={mobileNavigation.toggleMenu} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"><NavigationIcon close={mobileNavigation.menuOpen} /></button>
      <p className="min-w-0 font-semibold">SupportFlow</p>
    </div>}
    <p className={`min-w-0 font-semibold ${mobileNavigation ? 'hidden lg:block' : ''}`}>{title}</p>
    <div className={`flex min-w-0 items-center gap-3 ${mobileNavigation ? 'shrink-0 lg:max-w-[60%]' : 'sm:max-w-[60%]'}`}>
      <ThemeToggle />
      <div className={`min-w-0 flex-1 text-right ${mobileNavigation ? 'hidden lg:block' : ''}`}>
      <p className="break-words text-sm font-medium">{displayName}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{role}</p>
      </div>
    </div>
  </header>
}
