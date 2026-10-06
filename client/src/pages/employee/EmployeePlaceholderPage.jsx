import { useLocation } from 'react-router-dom'
import AuthFeedback from '../../auth/AuthFeedback'

export default function EmployeePlaceholderPage({ title, phase }) {
  const location = useLocation()
  const ticketNumber = location.pathname === '/employee/tickets' && location.state?.createdTicketNumber
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {typeof ticketNumber === 'string' && <div className="mt-4"><AuthFeedback variant="success">Ticket {ticketNumber} created successfully.</AuthFeedback></div>}
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Coming in Phase {phase}.</p>
    </section>
  )
}
