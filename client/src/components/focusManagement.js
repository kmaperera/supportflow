export function focusMainContent({ preventScroll = false } = {}) {
  const main = document.getElementById('main-content') || document.querySelector('main')
  if (!main) return
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
  main.focus({ preventScroll })
}

export function restoreFocus(trigger) {
  if (trigger?.isConnected && !trigger.matches(':disabled') && trigger.getClientRects().length) {
    trigger.focus({ preventScroll: true })
    if (document.activeElement === trigger) return
  }
  focusMainContent({ preventScroll: true })
}

export function dialogTabStops(element) {
  return [...element.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
    .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert]') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
}
