import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ThemeContext } from './ThemeContext'
import { THEME_KEY, normalizeTheme, readTheme, systemIsDark, applyTheme } from './theme'

export default function ThemeProvider({ children }) {
  const [theme, updateTheme] = useState(readTheme)
  const [systemDark, setSystemDark] = useState(systemIsDark)
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  useLayoutEffect(() => { applyTheme(resolvedTheme) }, [resolvedTheme])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(Boolean(media?.matches))
    onChange()
    media?.addEventListener('change', onChange)
    const onStorage = event => {
      if (event.key === THEME_KEY || event.key === null) updateTheme(normalizeTheme(event.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => {
      media?.removeEventListener('change', onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  const setTheme = useCallback(value => {
    const next = normalizeTheme(value)
    updateTheme(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* In-memory selection still works. */ }
  }, [])
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
