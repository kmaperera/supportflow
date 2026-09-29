export function formatAnalyticsMinutes(minutes) {
  if (minutes === null) return 'Not available'
  if (minutes > 0 && minutes < 1) return '<1m'
  const rounded = Math.round(minutes)
  return rounded < 60 ? `${rounded}m` : `${Math.floor(rounded / 60)}h ${rounded % 60}m`
}
