// Activity log: who did what, to which employee. Kept in this browser and pushed to MongoDB through the gateway.
import { useSyncExternalStore } from 'react'
import { currentUser, verifyPassword } from './auth'
import { atlasCall, atlasQuery, atlasReady } from './atlas'
import { isOwner } from './rbac'

export interface Entry {
  id: string; at: string
  agent: string; agentEmail: string; role: string
  employee: string; action: string; details: string
  sent?: boolean
}

const KEY = 'offboarding.audit.v1'
const KEEP = 4000 // newest entries kept in the browser; MongoDB keeps everything
let entries: Entry[] = []
try { const raw = localStorage.getItem(KEY); if (raw) entries = JSON.parse(raw) } catch { /* ignore */ }
let version = 0
let status = ''
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((f) => f()) }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, KEEP))) } catch { /* ignore */ } }
const newId = () => 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)

export const auditEntries = () => entries
export function useAudit() {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => version)
  return { entries, waiting: entries.filter((e) => !e.sent).length, status }
}

/** Record one action by the signed-in person. `employee` is the leaver it was about, if any. */
export function log(action: string, details: string, employee = '') {
  const u = currentUser()
  entries.unshift({ id: newId(), at: new Date().toISOString(), agent: u?.name ?? 'Unknown', agentEmail: u?.email ?? '', role: u?.role ?? '', employee, action, details })
  persist(); notify(); schedule()
}

let timer: ReturnType<typeof setTimeout> | undefined
const schedule = () => { if (!atlasReady()) return; clearTimeout(timer); timer = setTimeout(() => { void flush() }, 2000) }

/** Push everything not yet sent to MongoDB. */
export async function flush(): Promise<string | null> {
  if (!atlasReady()) return 'Set up the database first (Settings, Connections, Database).'
  const todo = entries.filter((e) => !e.sent)
  if (!todo.length) { status = ''; notify(); return null }
  try {
    for (let i = 0; i < todo.length; i += 200) {
      const part = todo.slice(i, i + 200)
      await atlasCall('/logs' + atlasQuery(), { method: 'POST', body: JSON.stringify({ entries: part.map(({ sent: _s, ...e }) => e) }) })
      part.forEach((e) => { e.sent = true })
    }
    status = ''; persist(); notify(); return null
  } catch (e) {
    status = e instanceof Error ? e.message : String(e)
    persist(); notify(); return status
  }
}

/** Bring in entries saved from other computers. */
export async function pullLog(): Promise<string | null> {
  if (!atlasReady()) return 'Set up the database first (Settings, Connections, Database).'
  try {
    const j = await atlasCall('/logs' + atlasQuery()) as { entries?: Entry[] }
    const have = new Set(entries.map((e) => e.id))
    const fresh = (j.entries ?? []).filter((e) => e && e.id && !have.has(e.id)).map((e) => ({ ...e, sent: true }))
    entries = [...entries, ...fresh].sort((a, b) => b.at.localeCompare(a.at))
    persist(); notify(); return null
  } catch (e) { return e instanceof Error ? e.message : String(e) }
}

/** Owner only, and the password must be typed again. Deletes from MongoDB first; if that fails nothing is removed. */
export async function clearLog(password: string): Promise<string | null> {
  if (!isOwner()) return 'Only the Owner can clear the log.'
  if (!(await verifyPassword(password))) return 'That password is not correct.'
  if (atlasReady()) {
    try { await atlasCall('/logs' + atlasQuery(), { method: 'DELETE' }) }
    catch (e) { return 'The database could not be cleared, so nothing was deleted. ' + (e instanceof Error ? e.message : '') }
  }
  const n = entries.length
  entries = []
  log('Log cleared', `Deleted ${n} log ${n === 1 ? 'entry' : 'entries'}${atlasReady() ? ' here and in the database' : ' from this browser'}.`)
  return null
}

/** Excel file of the rows given (so the filters you set are what you get). */
export async function exportXlsx(rows: Entry[]) {
  const { default: write } = await import('write-excel-file/browser')
  const head = ['When', 'Agent', 'Email', 'Employee', 'Action', 'Description'].map((value) => ({ value, fontWeight: 'bold' as const }))
  const body = rows.map((e) => [new Date(e.at).toLocaleString(), e.agent, e.agentEmail, e.employee, e.action, e.details].map((value) => ({ value: String(value ?? '') })))
  await write([head, ...body], { columns: [{ width: 20 }, { width: 22 }, { width: 28 }, { width: 24 }, { width: 22 }, { width: 70 }] }).toFile(`activity-log-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
