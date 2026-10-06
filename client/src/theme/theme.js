export const THEME_KEY = 'supportflow-theme'
export const normalizeTheme = value => value === 'dark' ? 'dark' : 'light'
export function readTheme() {
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)) } catch { return 'light' }
}
export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}
