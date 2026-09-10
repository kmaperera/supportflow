// Provider-owned callbacks let API utilities synchronize React state without hooks.
let handlers = null
export function registerSessionHandlers(next) {
  handlers = next
  return () => { if (handlers === next) handlers = null }
}
export function getSessionHandlers() { return handlers }
