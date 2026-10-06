const locks = new Set()
let previous

/** Nested native dialogs share one lock and restore the original inline styles. */
export function lockBodyScroll() {
  const token = {}
  if (!locks.size) {
    previous = { body: document.body.style.overflow, root: document.documentElement.style.overflow }
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
  locks.add(token)
  return () => {
    if (!locks.delete(token) || locks.size) return
    document.body.style.overflow = previous.body
    document.documentElement.style.overflow = previous.root
  }
}
