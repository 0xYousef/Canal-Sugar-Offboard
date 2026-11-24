// Turn a downloaded file into leavers: parse (CSV / Excel / JSON), map columns to fields, import.
import { fieldByKey } from './engine'
import { ensureSnapshot } from './snapshot'
import { uid } from './store'
import type { Field, Leaver, State } from './types'

export interface Table { headers: string[]; rows: string[][] }

export function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = [], cell = '', q = false
  const t = text.replace(/^﻿/, '')
  const delim = (t.split('\n', 1)[0].match(/;/g)?.length ?? 0) > (t.split('\n', 1)[0].match(/,/g)?.length ?? 0) ? ';' : ','
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
    else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); out.push(row) }
  return out.filter((r) => r.some((c) => c.trim() !== ''))
}

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const cellText = (c: unknown) => (c instanceof Date ? isoDate(c) : c == null ? '' : String(c))

export type Parsed = { kind: 'table'; table: Table } | { kind: 'backup'; data: unknown }
export async function parseFile(name: string, blob: Blob): Promise<Parsed> {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser')
    const rows = (await readSheet(blob)) as unknown[][]
    const [h, ...r] = rows.map((x) => x.map(cellText))
    if (!h) throw new Error('That workbook is empty.')
    return { kind: 'table', table: { headers: h, rows: r.filter((x) => x.some((c) => c.trim() !== '')) } }
  }
  const text = await blob.text()
  if (ext === 'json') {
    const j = JSON.parse(text)
    if (j && Array.isArray(j.steps) && Array.isArray(j.leavers)) return { kind: 'backup', data: j }
    const arr = Array.isArray(j) ? j : j.leavers
    if (!Array.isArray(arr) || !arr.length) throw new Error('JSON must be a list of objects, or an app backup.')
    const headers = [...new Set(arr.flatMap((o: Record<string, unknown>) => Object.keys(o.values ? (o.values as object) : o)))] as string[]
    return { kind: 'table', table: { headers, rows: arr.map((o: Record<string, unknown>) => headers.map((k) => cellText((o.values as Record<string, unknown> | undefined)?.[k] ?? o[k]))) } }
  }
  if (ext === 'xls') throw new Error('Old .xls files are not supported. Save as .xlsx or .csv.')
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('No data rows found in that file.')
  return { kind: 'table', table: { headers: rows[0].map((x) => x.trim()), rows: rows.slice(1) } }
}

/* ---- mapping ---- */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
export function autoMap(s: State, headers: string[]): Record<number, string> {
  const m: Record<number, string> = {}
  headers.forEach((h, i) => {
    const f = s.fields.find((x) => norm(x.label) === norm(h) || norm(x.key) === norm(h))
    if (f && !Object.values(m).includes(f.key)) m[i] = f.key
  })
  return m
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
export function normDate(v: string): string | null {
  const t = v.trim()
  if (!t) return ''
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)            // day first, the format used locally
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(\d{4})$/)
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function convert(s: State, f: Field, raw: string): { v: string } | { err: string } {
  const v = raw.trim()
  if (!v) return { v: '' }
  switch (f.type) {
    case 'date': { const d = normDate(v); return d === null ? { err: `"${v}" is not a date` } : { v: d } }
    case 'checkbox': return { v: /^(1|y|yes|true|x|✓)$/i.test(v) ? '1' : '' }
    case 'reason': {
      const r = s.reasons.find((x) => x.id.toLowerCase() === v.toLowerCase() || x.name.toLowerCase() === v.toLowerCase())
      return r ? { v: r.id } : { err: `"${v}" is not one of your reasons for leaving` }
    }
    case 'select': {
      const o = (f.options ?? []).find((x) => x.toLowerCase() === v.toLowerCase())
      return o ? { v: o } : { err: `"${v}" is not an option for ${f.label}` }
    }
    case 'number': return Number.isNaN(Number(v)) ? { err: `"${v}" is not a number` } : { v }
    default: return { v }
  }
}

export interface PreviewRow { values: Record<string, string>; errors: string[]; match: 'new' | 'update' | 'skip' }
export function buildPreview(s: State, table: Table, map: Record<number, string>): PreviewRow[] {
  return table.rows.map((r) => {
    const values: Record<string, string> = {}, errors: string[] = []
    Object.entries(map).forEach(([i, key]) => {
      const f = fieldByKey(s, key)
      if (!f || !key) return
      const c = convert(s, f, r[+i] ?? '')
      if ('err' in c) errors.push(c.err); else values[key] = c.v
    })
    const found = findExisting(s, values)
    const match = !values.name ? 'skip' : found ? 'update' : 'new'
    if (!values.name) errors.unshift('Missing employee name')
    return { values, errors, match }
  })
}
const findExisting = (s: State, v: Record<string, string>) =>
  s.leavers.find((l) => (v.empId && l.values.empId === v.empId) || (!v.empId && v.name && l.values.name?.toLowerCase() === v.name.toLowerCase()))

export type ImportMode = 'append' | 'replace'

/** What "replace" would do, judged by Employee ID (name only when a row has no ID). */
export function replacePlan(s: State, rows: PreviewRow[]) {
  const ok = rows.filter((r) => r.match !== 'skip' && !r.errors.length)
  const keep = new Set<Leaver>()
  ok.forEach((r) => { const ex = findExisting(s, r.values); if (ex) keep.add(ex) })
  const removed = s.leavers.filter((l) => !keep.has(l))
  return { removed, matched: keep.size, added: ok.filter((r) => !findExisting(s, r.values)).length }
}

/** Rows with errors are skipped. "append" adds only employees that are not in the portal yet and leaves existing ones untouched.
 *  "replace" also updates matches and deletes every leaver that is not in the file. */
export function runImport(s: State, rows: PreviewRow[], mode: ImportMode) {
  const replace = mode === 'replace'
  let skipped = 0, removed = 0
  const addedRows: Record<string, string>[] = [], existingRows: Record<string, string>[] = []
  if (replace) {
    const drop = new Set(replacePlan(s, rows).removed)
    removed = drop.size
    s.leavers = s.leavers.filter((l) => !drop.has(l))
  }
  rows.forEach((r) => {
    if (r.match === 'skip' || r.errors.length) return void skipped++
    const ex = findExisting(s, r.values)
    if (ex) { existingRows.push(r.values); if (replace) Object.assign(ex.values, r.values) }
    else { s.leavers.push({ id: uid(), values: { ...r.values }, tasks: {} } as Leaver); ensureSnapshot(s, s.leavers[s.leavers.length - 1]); addedRows.push(r.values) }
  })
  return { added: addedRows.length, updated: replace ? existingRows.length : 0, existing: existingRows.length, skipped, removed, addedRows, existingRows }
}

/** Two sheets: employees that were appended, and employees that were already in the portal. */
export async function exportImportReport(s: State, added: Record<string, string>[], existing: Record<string, string>[], fileName: string) {
  const { default: write } = await import('write-excel-file/browser')
  const cols = s.fields.filter((f) => [...added, ...existing].some((v) => v[f.key]))
  const sheet = (rows: Record<string, string>[]) => [
    cols.map((f) => ({ value: f.label, fontWeight: 'bold' as const })),
    ...rows.map((v) => cols.map((f) => ({ value: v[f.key] ?? '' }))),
  ]
  const columns = cols.map(() => ({ width: 22 }))
  await write([
    { data: sheet(added), sheet: 'New employees', columns },
    { data: sheet(existing), sheet: 'Already existed', columns },
  ]).toFile(`import-${fileName.replace(/\.[^.]+$/, '')}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
