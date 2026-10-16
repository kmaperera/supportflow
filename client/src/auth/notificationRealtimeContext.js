import { createContext, useContext } from 'react'

export const NotificationRealtimeContext = createContext({ revision: 0, unreadCount: null })
export function useNotificationRealtime() { return useContext(NotificationRealtimeContext) }
