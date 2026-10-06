const tones = {
  gray: 'bg-slate-100 text-slate-800',
  blue: 'bg-blue-50 text-blue-800',
  indigo: 'bg-indigo-50 text-indigo-800',
  amber: 'bg-amber-50 text-amber-900',
  orange: 'bg-orange-50 text-orange-900',
  green: 'bg-green-50 text-green-800',
  purple: 'bg-purple-50 text-purple-800',
  red: 'bg-red-100 text-red-900',
}
const ticketStates = {
  OPEN: ['Open', 'blue'], ASSIGNED: ['Assigned', 'indigo'],
  IN_PROGRESS: ['In Progress', 'amber'], WAITING_FOR_USER: ['Waiting for User', 'orange'],
  RESOLVED: ['Resolved', 'green'], CLOSED: ['Closed', 'gray'], REOPENED: ['Reopened', 'purple'],
}
const priorities = { LOW: ['Low', 'gray'], MEDIUM: ['Medium', 'blue'], HIGH: ['High', 'orange'], CRITICAL: ['Critical', 'red'] }
const states = {
  ACTIVE: ['Active', 'green'], INACTIVE: ['Inactive', 'gray'],
  PUBLISHED: ['Published', 'green'], DRAFT: ['Unpublished', 'amber'],
  UNPUBLISHED: ['Unpublished', 'amber'], ARCHIVED: ['Archived', 'gray'],
  READ: ['Read', 'gray'], UNREAD: ['Unread', 'blue'],
  ON_TRACK: ['On Track', 'green'], WARNING: ['SLA Warning', 'amber'],
  BREACHED: ['SLA Breached', 'red'], MET: ['Within SLA', 'green'],
  UNAVAILABLE: ['No SLA data available', 'gray'],
}
function normalize(value) {
  return typeof value === 'string' ? value.trim().replace(/[\s-]+/g, '_').toUpperCase() : ''
}
function humanize(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Unknown'
  return value.trim().replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
}
function Badge({ value, mapping, label }) {
  const key = normalize(value)
  const [text, tone] = Object.hasOwn(mapping, key) ? mapping[key] : [humanize(value), 'gray']
  return <span className={`inline-block w-fit max-w-full rounded-full px-2.5 py-0.5 align-middle text-xs font-semibold leading-5 whitespace-normal break-words ${tones[tone]}`}>{label || text}</span>
}
export function StatusBadge({ value }) { return <Badge value={value} mapping={ticketStates} /> }
export function PriorityBadge({ value }) { return <Badge value={value} mapping={priorities} /> }
export function StateBadge({ value, label }) { return <Badge value={value} mapping={states} label={label} /> }
export function ActiveBadge({ value }) { return <StateBadge value={value === true ? 'ACTIVE' : value === false ? 'INACTIVE' : null} /> }
