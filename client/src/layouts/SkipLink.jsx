import { focusMainContent } from '../components/focusManagement'

export default function SkipLink() {
  return <a href="#main-content" onClick={event => { event.preventDefault(); focusMainContent() }} className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-800 dark:focus:bg-slate-900 dark:focus:text-teal-300">Skip to main content</a>
}
