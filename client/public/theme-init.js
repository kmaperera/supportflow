// Runs before the application and styles to avoid a light first paint in dark mode.
;(() => {
  let theme = 'system'
  try {
    const saved = localStorage.getItem('supportflow-theme')
    if (['light', 'dark', 'system'].includes(saved)) theme = saved
  } catch { /* Storage can be blocked. */ }
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', Boolean(dark))
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()
