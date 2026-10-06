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
  return <p role={error ? 'alert' : 'status'} aria-atomic="true" className={`min-w-0 break-words rounded-lg border p-3 text-sm ${error ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300' : 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300'}`}>{children}</p>
}
