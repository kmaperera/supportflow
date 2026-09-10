import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { ROLES } from '../../auth/roles'
import { getRoleHome } from '../../auth/roleHome'
import SessionActions from '../../auth/SessionActions'

const roleLabels = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.TECHNICIAN]: 'Technician',
  [ROLES.EMPLOYEE]: 'Employee',
}

export default function ProfilePage() {
  const { user } = useAuth()
  const names = [user.firstName, user.lastName].filter(name => typeof name === 'string' && name.trim()).map(name => name.trim())
  const fullName = names.join(' ') || 'Not provided'
  const initials = names.map(name => Array.from(name)[0]).join('').toUpperCase() || '?'
  const role = roleLabels[user.role]
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Link to={getRoleHome(user.role)} className="rounded text-sm font-semibold text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">Return to dashboard</Link>
        <h1 className="mt-6 text-3xl font-semibold text-slate-900">My Profile</h1>
        <section aria-labelledby="account-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-6">
            <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xl font-semibold text-teal-900">{initials}</div>
            <div className="min-w-0">
              <p className="break-words text-xl font-semibold text-slate-900">{fullName}</p>
              <p className="mt-1 break-all text-sm text-slate-600">{user.email}</p>
            </div>
          </div>
          <h2 id="account-heading" className="mt-6 text-lg font-semibold text-slate-900">Account information</h2>
          <dl className="mt-5 grid gap-6 sm:grid-cols-2">
            <div><dt className="text-sm text-slate-600">Full Name</dt><dd className="mt-1 break-words font-medium text-slate-900">{fullName}</dd></div>
            <div><dt className="text-sm text-slate-600">Email Address</dt><dd className="mt-1 break-all font-medium text-slate-900">{user.email || 'Not provided'}</dd></div>
            <div><dt className="text-sm text-slate-600">Role</dt><dd className="mt-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800">{role}</span></dd></div>
            <div><dt className="text-sm text-slate-600">Account Status</dt><dd className="mt-2"><span className={`rounded-full px-3 py-1 text-sm font-medium ${user.isActive ? 'bg-teal-50 text-teal-900' : 'bg-slate-100 text-slate-700'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></dd></div>
          </dl>
        </section>
        <section aria-labelledby="session-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-9">
          <h2 id="session-heading" className="text-lg font-semibold text-slate-900">Session actions</h2>
          <SessionActions />
        </section>
      </div>
    </main>
  )
}
