export default function AuthFeedback({ children, variant = 'error' }) {
  if (!children) return null
  const error = variant === 'error'
  return <p role={error ? 'alert' : 'status'} aria-atomic="true" className={`rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>{children}</p>
}
