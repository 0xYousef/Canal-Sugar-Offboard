import { fmt } from './dates'
import type { Field, State } from './types'

export const FIELD_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'textarea', label: 'Long text' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'select', label: 'Dropdown' },
  { id: 'checkbox', label: 'Yes / No' },
] as const
export const SECTIONS = ['Employee', 'Dates', 'Other']

export function optionsOf(s: State, f: Field) {
  if (f.type === 'reason') return s.reasons.map((r) => ({ v: r.id, l: r.name }))
  return (f.options || []).map((o) => ({ v: o, l: o }))
}

export function display(s: State, f: Field | undefined, v: string | undefined) {
  if (!f) return v || '—'
  if (v === undefined || v === null || v === '') return f.type === 'checkbox' ? 'No' : '—'
  if (f.type === 'date') return fmt(v)
  if (f.type === 'reason') return s.reasons.find((r) => r.id === v)?.name || v
  if (f.type === 'checkbox') return 'Yes'
  return String(v)
}

export function slugKey(label: string) {
  const words = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length) return ''
  let k = words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('')
  if (/^[0-9]/.test(k)) k = 'f' + k
  return k
}
