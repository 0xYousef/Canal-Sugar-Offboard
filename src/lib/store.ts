// State + persistence. The ONLY file that touches localStorage.
// To move to a backend, replace load() / save(). Components re-render through useApp().
import { useSyncExternalStore } from 'react'
import { DEPARTMENTS, defaultState } from './defaults'
import type { State } from './types'

const KEY = 'offboarding.codebase.v2'

function valid(s: unknown): s is State {
  const x = s as State
  return !!x && Array.isArray(x.steps) && Array.isArray(x.leavers) && Array.isArray(x.fields) && Array.isArray(x.reasons) && Array.isArray(x.groups) && !!x.settings
}
/** Older saves had Department as free text. Make it a dropdown, keeping every name already typed. */
function migrate(s: State): State {
  const f = s.fields.find((x) => x.key === 'dept')
  if (f && f.type === 'text') {
    const seen = s.leavers.map((l) => (l.values.dept ?? '').trim()).filter(Boolean)
    f.type = 'select'
    f.options = [...new Set([...DEPARTMENTS, ...seen])]
  }
  return s
}
function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw); if (valid(s)) return migrate(s) }
  } catch { /* storage unavailable */ }
  return defaultState()
}

export const state: State = load()          // mutated in place, so imports stay valid
export const session = { role: 'Viewer', owner: false }    // UI-level role, not real security

let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((f) => f()) }

/** Called after every local change. The live sync listens here to send the change to the other computers. */
export const afterCommit = new Set<() => void>()
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ } }
export function commit() {
  save(); notify()
  afterCommit.forEach((f) => f())
}
/** Apply what came from the server: update the screen and the local copy, without sending it back. */
export function applyRemote(change: () => void) { change(); save(); notify() }
export function setRole(r: string, owner = false) {
  session.role = r; session.owner = owner
  notify()
}
export function replaceState(next: unknown) {
  if (!valid(next)) throw new Error('Not a valid backup')
  Object.keys(state).forEach((k) => delete (state as unknown as Record<string, unknown>)[k])
  Object.assign(state, migrate(next))
  commit()
}
export const resetState = () => replaceState(defaultState())

export const uid = () => 'l' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)


/** Changes on every commit. Use as a useMemo key, since state is mutated in place. */
export const getVersion = () => version

/** Subscribe a component to the store. Returns the live state. */
export function useApp() {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => version,
  )
  return state
}
