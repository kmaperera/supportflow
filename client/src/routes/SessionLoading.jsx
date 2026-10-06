import LoadingState from '../components/LoadingState'
export default function SessionLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 text-slate-600 dark:text-slate-300"><LoadingState>Checking session...</LoadingState></main>
}
