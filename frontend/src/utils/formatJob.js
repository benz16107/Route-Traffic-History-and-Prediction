import { shortenToStreet } from './formatAddress.js'

function str(val) {
  if (val == null) return ''
  const s = String(val).trim()
  return s
}

/** Get a string field from job by key (tries snake_case and camelCase). */
function getField(job, snakeKey) {
  if (!job || typeof job !== 'object') return ''
  const camelKey = snakeKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  const v = job[snakeKey] ?? job[camelKey]
  return str(v)
}

/** Get custom start name from job. */
function getStartName(job) {
  return getField(job, 'start_name')
}

/** Get custom end name from job. */
function getEndName(job) {
  return getField(job, 'end_name')
}

/** Get route title (custom name) from job. */
function getRouteName(job) {
  return getField(job, 'name') || getField(job, 'routeName')
}

/**
 * Main title for a job:
 * - If route title (name) is entered → use it.
 * - Else if custom start or end name is entered → "start_name → end_name" (address used for the side without a name).
 * - Else → shortened start and end addresses only.
 */
export function getJobTitle(job) {
  if (!job) return '—'
  const routeName = getRouteName(job)
  if (routeName) return routeName
  const startName = getStartName(job)
  const endName = getEndName(job)
  const startLabel = startName || shortenToStreet(job.start_location) || '—'
  const endLabel = endName || shortenToStreet(job.end_location) || '—'
  return `${startLabel} → ${endLabel}`
}

/**
 * Subtitle when job has a custom route title and at least one start/end name: "start_name → end_name".
 */
export function getJobSubtitle(job) {
  if (!job) return null
  const routeName = getRouteName(job)
  if (!routeName) return null
  const startName = getStartName(job)
  const endName = getEndName(job)
  if (!startName && !endName) return null
  const startLabel = startName || shortenToStreet(job.start_location) || '—'
  const endLabel = endName || shortenToStreet(job.end_location) || '—'
  return `${startLabel} → ${endLabel}`
}

/**
 * Format job cycle interval for display (e.g. "Every 5 min", "Every 30s").
 */
export function formatCycleLabel(job) {
  if (!job) return '—'
  const sec = parseInt(job.cycle_seconds, 10)
  if (!Number.isNaN(sec) && sec > 0) {
    return `Every ${sec}s`
  }
  const min = parseInt(job.cycle_minutes, 10) || 60
  return `Every ${min} min`
}

/**
 * Format navigation type with capital first letter (e.g. "driving" → "Driving").
 */
export function formatNavigationType(type) {
  if (!type || typeof type !== 'string') return 'Driving'
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
}

const SEP = ' · '

/**
 * Short meta string for tiles/lists: "Every 5 min · 7 days · Driving"
 */
export function formatJobMetaShort(job) {
  if (!job) return ''
  const cycle = formatCycleLabel(job)
  const days = job.duration_days ?? 7
  const mode = formatNavigationType(job.navigation_type)
  return [cycle, `${days} days`, mode].join(SEP)
}
