export const THEME_KEY = 'supportflow-theme'
export const normalizeTheme = value => ['light', 'dark', 'system'].includes(value) ? value : 'system'
export function readTheme() {
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)) } catch { return 'system' }
}
export function systemIsDark() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}
export function applyTheme(resolvedTheme) {
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  document.documentElement.style.colorScheme = resolvedTheme
}

export const themeOptions = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]
