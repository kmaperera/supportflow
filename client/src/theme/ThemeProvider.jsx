import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ThemeContext } from './ThemeContext'
import { THEME_KEY, normalizeTheme, readTheme, applyTheme } from './theme'

export default function ThemeProvider({ children }) {
  const [theme, updateTheme] = useState(readTheme)
  useLayoutEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => {
    const onStorage = event => {
      if (event.key === THEME_KEY || event.key === null) updateTheme(normalizeTheme(event.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  const setTheme = useCallback(value => {
    const next = normalizeTheme(value)
    updateTheme(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* In-memory selection still works. */ }
  }, [])
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
