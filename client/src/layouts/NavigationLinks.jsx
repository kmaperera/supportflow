import { NavLink } from 'react-router-dom'

export default function NavigationLinks({ items, onNavigate }) {
  return <ul className="space-y-1">
    {items.map(item => <li key={item.path}>
      <NavLink to={item.path} end={item.end !== false} onClick={onNavigate} className={({ isActive }) => `block min-h-11 rounded-lg px-3 py-3 text-sm font-semibold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 ${isActive ? 'bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-200 ring-1 ring-inset ring-teal-200 dark:ring-teal-800' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'}`}>{item.label}</NavLink>
    </li>)}
  </ul>
}
