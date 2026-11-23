// First run: after signing in, ask for the leaver file before showing the portal.
import { useSyncExternalStore } from 'react'
import { commit, state } from './store'
import { can } from './rbac'
import { log } from './audit'

const KEY = 'offboarding.started.v1'
let started = false
try { started = !!localStorage.getItem(KEY) } catch { /* ignore */ }
let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((f) => f()) }

const isDemo = (l: { values: Record<string, string> }) => l.values.notes === 'Demo record'
/** True until a file was loaded or the person chose to skip. Existing installs with real leavers never see it. */
export function useStartGate() {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => version)
  return !started && (can('leavers', 'edit') || can('settings', 'edit')) && state.leavers.every(isDemo)
}
export function finishStart() {
  started = true
  try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
  notify()
}
/** Drop the sample people (before loading real ones, or to start empty). */
export function removeDemoLeavers() {
  const n = state.leavers.filter(isDemo).length
  if (!n) return
  state.leavers = state.leavers.filter((l) => !isDemo(l)); commit()
}
export function startEmpty() { removeDemoLeavers(); log('Started', 'Started with an empty list.'); finishStart() }
/** A new day on an empty shared sheet: ask for the file again. */
export function resetStart() {
  started = false
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  notify()
}
