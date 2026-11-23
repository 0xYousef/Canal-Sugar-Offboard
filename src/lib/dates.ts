// Dates are ISO strings (YYYY-MM-DD) handled at noon UTC so the viewer's time zone never shifts a day.
import type { Settings } from './types'

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const D = (s: string) => new Date(s + 'T12:00:00Z')
export const iso = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(s: string, n: number) {
  const d = D(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export const diff = (a: string, b: string) => Math.round((D(a).getTime() - D(b).getTime()) / 864e5)

export function fmt(s?: string | null) {
  if (!s) return '—'
  const d = D(s)
  return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear()
}

export function addMonths(s: string, n: number) {
  const d = D(s)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return iso(d)
}

export function localToday() {
  const n = new Date()
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0')
}

// Working-day calendar. weekend 'FS' = Friday+Saturday, 'SS' = Saturday+Sunday.
export function calendar(settings: Settings) {
  const hol = new Set((settings.holidays || []).map((h) => h.date))
  const isOff = (s: string) => {
    const dow = D(s).getUTCDay()
    const weekend = settings.weekend === 'SS' ? dow === 6 || dow === 0 : dow === 5 || dow === 6
    return weekend || hol.has(s)
  }
  // Move n working days from s. dir = 1 (after) or -1 (before). The start day is not counted.
  const addWD = (s: string, n: number, dir: 1 | -1) => {
    let cur = s
    let left = n
    while (left > 0) {
      cur = addDays(cur, dir)
      if (!isOff(cur)) left--
    }
    return cur
  }
  return { isOff, addWD }
}
export type Cal = ReturnType<typeof calendar>
