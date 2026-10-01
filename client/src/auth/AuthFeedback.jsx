import { Children, useContext, useEffect } from 'react'
import { ToastContext } from '../components/toastContext'

export default function AuthFeedback({ children, variant = 'error', toast = true }) {
  const notifications = useContext(ToastContext)
  const message = Children.toArray(children).filter(child => typeof child === 'string' || typeof child === 'number').join('')
  const transient = toast && variant === 'success' && notifications && message
  useEffect(() => {
    if (transient) notifications.success(message)
  }, [transient, notifications, message])
  if (transient) return null
  if (!children) return null
  const error = variant === 'error'
  return <p role={error ? 'alert' : 'status'} aria-atomic="true" className={`min-w-0 break-words rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>{children}</p>
}
