// MongoDB Atlas copy. The browser never holds the database password: it talks to the small gateway in
// gateway, and only that gateway's address and key come from the project's .env file (VITE_DB_*).
import { useEffect, useSyncExternalStore } from 'react'
import { replaceState, state } from './store'

const env = import.meta.env
const config = {
  endpoint: String(env.VITE_DB_URL ?? '').trim().replace(/\/+$/, ''),
  apiKey: String(env.VITE_DB_KEY ?? ''),
  database: String(env.VITE_DB_NAME || 'offboarding').trim(),
  collection: String(env.VITE_DB_COLLECTION || 'app_state').trim(),
}
let authToken = ''
export const setAuthToken = (t: string) => { authToken = t }
export const atlasReady = () => /^https?:\/\//i.test(config.endpoint)

const KEY = 'offboarding.atlas.v2'
let last: { at: string; what: string } | null = null
try { const raw = localStorage.getItem(KEY); if (raw) last = JSON.parse(raw) } catch { /* ignore */ }
let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((f) => f()) }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(last)) } catch { /* ignore */ } }
export function useAtlasLast() {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => version)
  return last
}

export const atlasQuery = () => `?database=${encodeURIComponent(config.database)}&collection=${encodeURIComponent(config.collection)}`
export async function atlasCall(path: string, init: RequestInit = {}) {
  if (!atlasReady()) throw new Error('The database is not set up. Add VITE_DB_URL to the .env file and rebuild.')
  let res: Response
  try {
    res = await fetch(config.endpoint + path, { ...init, headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}), ...init.headers } })
  } catch { throw new Error('Could not reach the database gateway. Check that it is running and allows this site.') }
  let body: { error?: string } & Record<string, unknown> = {}
  try { body = await res.json() } catch { /* empty */ }
  if (body.error === 'Wrong access key.') throw new Error('The gateway refused the access key in .env.')
  if (!res.ok) throw new Error(body.error || `The gateway answered with an error (${res.status}).`)
  return body
}

/** Asks the gateway to reach Atlas. Returns a short sentence for the screen. */
export async function checkAtlas(): Promise<string> {
  const j = await atlasCall('/health' + atlasQuery())
  return `Connected to database \u201c${String(j.database ?? config.database)}\u201d.`
}
export async function pushToAtlas() {
  await atlasCall('/state' + atlasQuery(), { method: 'PUT', body: JSON.stringify({ state }) })
  last = { at: new Date().toISOString(), what: 'Saved to the database' }; persist(); notify()
}
export async function pullFromAtlas() {
  const j = await atlasCall('/state' + atlasQuery()) as { state?: unknown }
  if (!j.state) throw new Error('The database has no saved copy yet. Use \u201cSave to database\u201d first.')
  replaceState(j.state)
  last = { at: new Date().toISOString(), what: 'Loaded from the database' }; persist(); notify()
}

/* ---- live connection status, for the lamp in the top bar ---- */
export type DbState = 'off' | 'checking' | 'ok' | 'error'
let db: { state: DbState; text: string } = { state: atlasReady() ? 'checking' : 'off', text: atlasReady() ? 'Checking the database' : 'Database not set up' }
let dbVersion = 0
const dbListeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let users = 0
async function refresh() {
  if (!atlasReady()) return
  try { const text = await checkAtlas(); db = { state: 'ok', text } } catch (e) { db = { state: 'error', text: e instanceof Error ? e.message : String(e) } }
  dbVersion++; dbListeners.forEach((f) => f())
}
export const recheckDb = refresh
/** Checks the gateway now and every minute while something on screen shows the lamp. */
export function useDbStatus() {
  useSyncExternalStore((cb) => { dbListeners.add(cb); return () => { dbListeners.delete(cb) } }, () => dbVersion)
  useEffect(() => {
    if (!atlasReady()) return
    if (users++ === 0) { void refresh(); timer = setInterval(() => { void refresh() }, 60_000) }
    return () => { if (--users === 0) clearInterval(timer) }
  }, [])
  return db
}
