import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { ROLES } from './roles'
import { useToast } from '../components/toastContext'
import { subscribeToNotifications } from '../api/notificationRealtime'
import { getNotifications } from '../api/notificationApi'
import { NotificationRealtimeContext } from './notificationRealtimeContext'

export default function NotificationRealtimeProvider({ children }) {
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const userId = user?.id
  const role = user?.role
  const eligible = Boolean(userId && typeof accessToken === 'string' && accessToken.trim() &&
    Object.values(ROLES).includes(role) && !user?.mustChangePassword)
  const [state, setState] = useState({ owner: null, revision: 0, unreadCount: null })

  useEffect(() => {
    if (!eligible) return
    let active = true
    let recovery
    const allowInternal = role === ROLES.ADMIN || role === ROLES.TECHNICIAN
    const origin = new URL(import.meta.env.VITE_API_BASE_URL || '/', window.location.href).origin
    const cleanup = subscribeToNotifications({
      token: accessToken, origin,
      onNotification(notification) {
        if (!active || !allowInternal) return
        if (notification.type === 'SLA_WARNING') toast.warning('A support deadline is approaching. Check your notifications.')
        if (notification.type === 'SLA_BREACHED') toast.warning('A support deadline has been exceeded. Check your notifications.')
      },
      onRefresh() {
        if (!active) return
        recovery?.abort()
        recovery = new AbortController()
        const request = recovery
        // Recover persisted state even when the inbox is not mounted.
        getNotifications({ signal: request.signal, allowInternal }).then(data => {
          if (!active || request.signal.aborted) return
          setState(previous => ({ owner: userId, unreadCount: data.unreadCount,
            revision: previous.owner === userId ? previous.revision + 1 : 1 }))
        }).catch(() => {
          // The inbox owns its visible retry/error UI; later focus/reconnect retries.
          if (!active || request.signal.aborted) return
          setState(previous => ({ owner: userId, unreadCount: null,
            revision: previous.owner === userId ? previous.revision + 1 : 1 }))
        })
      },
    })
    return () => { active = false; recovery?.abort(); cleanup() }
  }, [eligible, accessToken, userId, role, toast])

  const value = eligible && state.owner === userId ? state : { revision: 0, unreadCount: null }
  return <NotificationRealtimeContext.Provider value={value}>{children}</NotificationRealtimeContext.Provider>
}
