// Mirrors Phase 9 calculateSlaWarning/detectPendingDeadlineBreach and completion rules.
// The backend warning notification service uses the default 20% threshold.
export function getSlaDisplayState({ created, deadline, completed, completionProvided = false, stopped, recordedBreach, now }) {
  if (recordedBreach === true) return 'breached'
  if (deadline === null || (completionProvided && completed === null)) return 'unavailable'
  if (created !== null && (deadline <= created || (completed !== null && completed < created))) return 'unavailable'
  if (completed !== null) return completed <= deadline ? 'met' : 'breached'
  if (stopped) return 'unavailable'
  if (now > deadline) return 'breached'
  if (created === null) return 'unavailable'
  const remaining = deadline - now
  return remaining > 0 && remaining <= (deadline - created) * 0.2 ? 'warning' : 'on-track'
}
