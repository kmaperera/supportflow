// Runs before the application and styles to avoid a light first paint in dark mode.
;(() => {
  let theme = 'light'
  try {
    const saved = localStorage.getItem('supportflow-theme')
    if (['light', 'dark'].includes(saved)) theme = saved
  } catch { /* Storage can be blocked. */ }
  const dark = theme === 'dark'
  document.documentElement.classList.toggle('dark', Boolean(dark))
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()
