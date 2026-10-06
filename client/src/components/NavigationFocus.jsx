import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { focusMainContent } from './focusManagement'

export default function NavigationFocus() {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    const frame = requestAnimationFrame(() => focusMainContent())
    return () => cancelAnimationFrame(frame)
  }, [pathname])
  useEffect(() => {
    let focused = document.activeElement
    const track = event => { if (event.target !== document.body) focused = event.target }
    document.addEventListener('focusin', track)
    // Recover only a detached control, never a surviving field or active modal.
    const observer = new MutationObserver(() => {
      if (focused && !focused.isConnected && document.activeElement === document.body && !document.querySelector('dialog[open]')) {
        focusMainContent({ preventScroll: true })
        focused = document.activeElement
      }
    })
    const root = document.getElementById('root')
    if (root) observer.observe(root, { childList: true, subtree: true })
    return () => { observer.disconnect(); document.removeEventListener('focusin', track) }
  }, [])
  return null
}
