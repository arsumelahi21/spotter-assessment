import type { DutyStatus, EventKind } from '../types'

/**
 * The API returns ISO timestamps already in home-terminal time (with offset).
 * Read the wall clock straight from the string so the browser's own time zone
 * never shifts what the driver's log shows.
 */
function parts(iso: string) {
  const [d, t] = iso.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  return { y, m, day, hh, mm }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function clock(hh: number, mm: number) {
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`
}

export function fmtTime(iso: string) {
  const { hh, mm } = parts(iso)
  return clock(hh, mm)
}

export function fmtDate(isoOrDate: string, withWeekday = true) {
  const { y, m, day } = parts(isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T00:00`)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
  return `${withWeekday ? wd + ', ' : ''}${MONTHS[m - 1]} ${day}`
}

export function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`
}

export function fmtMinuteOfDay(minute: number) {
  return clock(Math.floor(minute / 60) % 24, minute % 60)
}

export function fmtHours(h: number) {
  const whole = Math.floor(h + 1e-9)
  const mins = Math.round((h - whole) * 60)
  if (whole === 0) return `${mins}m`
  return mins ? `${whole}h ${mins}m` : `${whole}h`
}

export function fmtMiles(mi: number) {
  return `${Math.round(mi).toLocaleString()} mi`
}

export const STATUS_META: Record<DutyStatus, { label: string; short: string; color: string; bg: string }> = {
  OFF: { label: 'Off Duty', short: 'Off', color: '#64748b', bg: 'bg-slate-100 text-slate-700' },
  SB: { label: 'Sleeper Berth', short: 'Sleeper', color: '#6366f1', bg: 'bg-indigo-50 text-indigo-700' },
  D: { label: 'Driving', short: 'Driving', color: '#0d9488', bg: 'bg-teal-50 text-teal-700' },
  ON: { label: 'On Duty (not driving)', short: 'On duty', color: '#f59e0b', bg: 'bg-amber-50 text-amber-700' },
}

export const KIND_META: Record<EventKind | 'current', { label: string; color: string }> = {
  current: { label: 'Start', color: '#0b2e3a' },
  pre_trip: { label: 'Pre-trip inspection', color: '#f59e0b' },
  drive: { label: 'Driving', color: '#0d9488' },
  pickup: { label: 'Pickup', color: '#2563eb' },
  dropoff: { label: 'Drop-off', color: '#e8505b' },
  fuel: { label: 'Fuel stop', color: '#f59e0b' },
  break: { label: '30-min break', color: '#64748b' },
  rest: { label: '10-hr rest', color: '#6366f1' },
  restart: { label: '34-hr restart', color: '#7c3aed' },
  post_trip: { label: 'Post-trip inspection', color: '#f59e0b' },
}

/** Value for a <input type="datetime-local"> rounded up to the next quarter hour. */
export function nextQuarterHourLocal() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
