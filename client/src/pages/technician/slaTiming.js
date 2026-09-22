export function parseSlaTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  // JSON dates include Z; also accept the backend's UTC SQL timestamp notation.
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(text)) return null
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text.replace(' ', 'T')}Z`
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function formatRemaining(deadline, now) {
  if (deadline <= now) return 'Deadline passed'
  const seconds = Math.ceil((deadline - now) / 1000)
  const days = Math.floor(seconds / 86400)
  const pad = value => String(value).padStart(2, '0')
  return `${days ? `${days}d ` : ''}${pad(Math.floor(seconds / 3600) % 24)}h ${pad(Math.floor(seconds / 60) % 60)}m ${pad(seconds % 60)}s remaining`
}
