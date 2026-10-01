import { io } from 'socket.io-client'

// Shared by all role inboxes. The server joins the JWT owner's user room;
// the client never supplies a recipient ID or requests a room itself.
export function subscribeToNotifications({ token, onRefresh, onNotification, origin }, connect = io) {
  const socket = connect(origin, { auth: { token }, withCredentials: true })
  const seen = new Set()
  let timer
  function scheduleRefresh() {
    clearTimeout(timer)
    timer = setTimeout(onRefresh, 150)
  }
  function receive(notification) {
    if (!notification?.id || !/^[1-9]\d*$/.test(String(notification.id))) return
    const id = String(notification.id)
    if (seen.has(id)) return
    seen.add(id)
    if (seen.size > 200) seen.delete(seen.values().next().value)
    onNotification?.(notification)
    scheduleRefresh()
  }
  socket.on('notification:new', receive)
  // Reconcile missed events after reconnecting; REST remains authoritative.
  socket.on('connect', scheduleRefresh)
  return () => {
    clearTimeout(timer)
    socket.off('notification:new', receive)
    socket.off('connect', scheduleRefresh)
    socket.disconnect()
  }
}
