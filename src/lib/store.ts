// State + persistence. The ONLY file that touches localStorage.
// To move to a backend, replace load() / save(). Components re-render through useApp().
import { useSyncExternalStore } from 'react'
import { DEPARTMENTS, defaultState } from './defaults'
import { DEFAULT_FLOW, normalizeFlow } from './flowDefaults'
import { autoArchive } from './engine'
import { ensureSnapshot } from './snapshot'
import type { State } from './types'

const KEY = 'offboarding.codebase.v2'

function valid(s: unknown): s is State {
  const x = s as State
  return !!x && Array.isArray(x.steps) && Array.isArray(x.leavers) && Array.isArray(x.fields) && Array.isArray(x.reasons) && Array.isArray(x.groups) && !!x.settings
}
/** Older saves had Department as free text. Make it a dropdown, keeping every name already typed. */
/** Employee ID is the unique identifier (always required); the name is optional. Also applied to configuration that arrives from the shared database. */
export function ensureIdentity(s: State) {
  const idf = s.fields.find((x) => x.key === 'empId')
  if (idf) { idf.builtin = true; idf.required = true }
  const nf = s.fields.find((x) => x.key === 'name')
  if (nf) nf.required = false
  // Email was added later: older saves get it once, right after Employee ID, and the admin can edit or remove it.
  if (!s.settings.emailField) {
    s.settings.emailField = true
    if (!s.fields.some((x) => x.key === 'email')) { const at = s.fields.findIndex((x) => x.key === 'empId'); s.fields.splice(at + 1, 0, { key: 'email', label: 'Email', type: 'text', section: 'Employee', builtin: false, required: false, requiredFor: [], showInList: false }) }
  }
  const sf = s.fields.find((x) => x.key === 'site')
  if (sf && sf.label === 'Site') sf.label = 'Location'   // renamed; the key stays, so saved data and imports with a Site column still match
  // Department and Location become required once. Afterwards the admin can switch it off in Settings.
  if (!s.settings.deptSiteRequired) { s.fields.forEach((f) => { if (f.key === 'dept' || f.key === 'site') f.required = true }); s.settings.deptSiteRequired = true }
}
function migrate(s: State): State {
  // Action records were first saved under "STEP#ACTION", which the shared database refuses; they live under "STEP__ACTION" now.
  s.leavers.forEach((l) => Object.keys(l.tasks).forEach((k) => { if (k.includes('#')) { const n = k.replace('#', '__'); if (!(n in l.tasks)) l.tasks[n] = l.tasks[k]; delete l.tasks[k] } }))
  // The task actions are saved data, not code: older saves get the original four written in once, then they are just entries like any other.
  // Only the admin's own actions remain: the old built-in Waive / Block / Reopen entries are dropped, and every action finishes the task.
  s.settings.flow = normalizeFlow(s.settings.flow ?? JSON.parse(JSON.stringify(DEFAULT_FLOW)))
  // Leavers created before rules were frozen per leaver get the rules as configured now, once.
  s.leavers.forEach((l) => ensureSnapshot(s, l))
  // Employee ID is the unique identifier: always built in and required.
  ensureIdentity(s)
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
export const session = { role: 'Viewer', owner: false, archive: false }    // UI-level role, not real security

let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((f) => f()) }

/** Called after every local change. The live sync listens here to send the change to the other computers. */
export const afterCommit = new Set<() => void>()
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ } }
export function commit() {
  autoArchive(state)
  // While a configuration page is in edit mode, changes only show on screen. Save changes is what stores and shares them.
  if (draft !== null) { notify(); return }
  save(); notify()
  afterCommit.forEach((f) => f())
}

/* ---- edit mode for the configuration pages ---- */
const CONFIG_KEYS = ['settings', 'reasons', 'groups', 'members', 'fields', 'steps'] as const
let draft: string | null = null                 // the configuration as it was when editing started
let editId: string | null = null                // which box is being edited (one at a time)
const configJson = () => JSON.stringify(Object.fromEntries(CONFIG_KEYS.map((k) => [k, (state as unknown as Record<string, unknown>)[k]])))
/** Is a box being edited? With an id: is that very box being edited. */
export const isEditing = (id?: string) => draft !== null && (id === undefined || id === editId)
export const editingId = () => editId
export const hasUnsaved = () => draft !== null && configJson() !== draft
export function startEdit(id: string) { if (draft === null) { draft = configJson(); editId = id; notify() } }
export function saveEdit() { if (draft === null) return; draft = null; editId = null; commit() }
/** Put the configuration back exactly as it was when editing started. */
export function cancelEdit() {
  if (draft === null) return
  const snap = JSON.parse(draft) as Record<string, unknown>
  const st = state as unknown as Record<string, unknown>
  CONFIG_KEYS.forEach((k) => { if (k in snap) st[k] = snap[k]; else delete st[k] })
  draft = null; editId = null; notify()
}
/** Apply what came from the server: update the screen and the local copy, without sending it back. */
export function applyRemote(change: () => void) { change(); save(); notify() }
export function setRole(r: string, owner = false, archive = false) {
  session.role = r; session.owner = owner; session.archive = archive
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
