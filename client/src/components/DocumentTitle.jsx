import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Follow the rendered page heading, including titles loaded asynchronously. */
export default function DocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    function update() {
      const heading = document.querySelector('main h1') || document.querySelector('h1')
      const title = heading?.textContent.trim()
      const next = title ? `${title} | SupportFlow` : 'SupportFlow'
      if (document.title !== next) document.title = next
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.getElementById('root'), { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [pathname])
  return null
}
