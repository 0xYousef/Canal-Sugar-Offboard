// Live sheet: everyone signed in works on the same leavers. Changes are sent to the gateway a moment after they
// are made, and every computer asks for what is new every few seconds. Only the parts that changed are sent
// (a field, or one task), so two people working on the same leaver do not overwrite each other.
import { normalizeFlow } from './flowDefaults'
import { ensureSnapshot } from './snapshot'
import { useSyncExternalStore } from 'react'
import { toast } from '@heroui/react'
import { atlasCall, atlasQuery, atlasReady } from './atlas'
import { afterCommit, applyRemote, state } from './store'
import { resetStart } from './start'
import type { Leaver } from './types'

export interface LiveInfo {
  status: 'off' | 'connecting' | 'live' | 'error'
  detail: string
  endTime: string; enabled: boolean
  /** Minutes since midnight on the server when this was read, and when that was on this computer. */
  nowMin: number; readAt: number
  sheet: { name: string; by: string; at: string } | null
  lastSync: number
}
let info: LiveInfo = { status: 'off', detail: '', endTime: '18:00', enabled: false, nowMin: 0, readAt: 0, sheet: null, lastSync: 0 }
let ver = 0
const subs = new Set<() => void>()
const set = (p: Partial<LiveInfo>) => { info = { ...info, ...p }; ver++; subs.forEach((f) => f()) }
export function useLive() {
  useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => ver)
  return info
}
/** Minutes left until the closing time on the server's clock, or null when it is off. */
export function minutesToClose(i: LiveInfo) {
  if (!i.enabled || !i.readAt) return null
  const now = i.nowMin + (Date.now() - i.readAt) / 60000
  const [h, m] = i.endTime.split(':').map(Number)
  return h * 60 + m - now
}

/** True once the closing time has passed today (only when the daily removal is switched on). Adding leavers is closed until the next day. */
export const afterClose = (i: LiveInfo, st?: { lockAfterClose?: boolean }) => {
  if (!(st?.lockAfterClose ?? i.enabled) || !i.readAt) return false
  const now = i.nowMin + (Date.now() - i.readAt) / 60000
  const [h, m] = i.endTime.split(':').map(Number)
  return now >= h * 60 + m
}

type Snap = { v: Record<string, string>; t: Record<string, string> }
let synced = new Map<string, Snap>()           // what the server holds, per leaver
let cfgSynced = ''
let since = 0, epoch = 0, first = true
let timer: ReturnType<typeof setInterval> | undefined, push: ReturnType<typeof setTimeout> | undefined
let pushing = false, running = false, sheetNote: string | null = null

const snap = (l: Leaver): Snap => ({ v: { ...l.values }, t: Object.fromEntries(Object.entries(l.tasks).map(([k, r]) => [k, JSON.stringify(r)])) })
const cfgOf = () => ({ settings: state.settings, reasons: state.reasons, groups: state.groups, members: state.members ?? {}, fields: state.fields, steps: state.steps, slaVersions: state.slaVersions ?? {} })

/** Compare the screen with what the server holds. Returns the changes to send, and the snapshot to keep afterwards. */
function diff() {
  const changes: object[] = [], next = new Map<string, Snap>()
  for (const l of state.leavers) {
    const now = snap(l), was = synced.get(l.id)
    next.set(l.id, now)
    if (!was) { changes.push({ id: l.id, values: now.v, tasks: Object.fromEntries(Object.entries(l.tasks)) }); continue }
    const values: Record<string, string | null> = {}, tasks: Record<string, unknown> = {}
    for (const k of Object.keys(now.v)) if (now.v[k] !== was.v[k]) values[k] = now.v[k]
    for (const k of Object.keys(was.v)) if (!(k in now.v)) values[k] = null
    for (const k of Object.keys(now.t)) if (now.t[k] !== was.t[k]) tasks[k] = l.tasks[k]
    for (const k of Object.keys(was.t)) if (!(k in now.t)) tasks[k] = null
    if (Object.keys(values).length || Object.keys(tasks).length) changes.push({ id: l.id, values, tasks })
  }
  for (const id of synced.keys()) if (!next.has(id)) changes.push({ id, del: true })
  const cfg = JSON.stringify(cfgOf())
  return { changes, next, cfg: cfg !== cfgSynced ? cfg : null }
}

async function flush() {
  if (!running || pushing) return
  const { changes, next, cfg } = diff()
  const sheet = sheetNote
  if (!changes.length && !cfg && !sheet) return
  pushing = true
  try {
    await atlasCall('/live' + atlasQuery(), { method: 'POST', body: JSON.stringify({ changes, cfg: cfg ? JSON.parse(cfg) : undefined, sheet: sheet ? { name: sheet } : undefined }) })
    synced = next; if (cfg) cfgSynced = cfg; if (sheet === sheetNote) sheetNote = null
    set({ status: 'live', detail: '', lastSync: Date.now() })
  } catch (e) {
    set({ status: 'error', detail: e instanceof Error ? e.message : String(e) })
    clearTimeout(push); push = setTimeout(() => { push = undefined; void flush() }, 5000)
  }
  pushing = false
  // more changes arrived while this one was on its way
  if (running && (diff().changes.length)) { clearTimeout(push); push = setTimeout(() => { push = undefined; void flush() }, 400) }
}
const schedule = () => { if (!running) return; clearTimeout(push); push = setTimeout(() => { push = undefined; void flush() }, 500) }

interface Pull { rev: number; epoch: number; reset: boolean; endTime: string; enabled: boolean; nowMin: number; sheet: LiveInfo['sheet']; cfg?: ReturnType<typeof cfgOf> | null
  leavers: { id: string; values: Record<string, string>; tasks: Leaver['tasks']; deleted: boolean }[] }

async function pull() {
  if (!running || pushing || push) return                // our own change is still on its way: do not overwrite it
  try {
    const j = await atlasCall(`/live${atlasQuery()}&since=${since}&epoch=${epoch}`) as unknown as Pull
    if (push || pushing) return
    set({ status: 'live', detail: '', endTime: j.endTime, enabled: j.enabled, nowMin: j.nowMin, readAt: Date.now(), sheet: j.sheet, lastSync: Date.now() })
    const wasEmptied = !first && j.reset && state.leavers.length > 0
    if (j.reset || j.leavers.length || (j.cfg && JSON.stringify(j.cfg) !== cfgSynced)) {
      applyRemote(() => {
        if (j.reset) { state.leavers = []; synced = new Map() }
        for (const d of j.leavers) {
          const i = state.leavers.findIndex((l) => l.id === d.id)
          if (d.deleted) { if (i >= 0) state.leavers.splice(i, 1); synced.delete(d.id); continue }
          const l: Leaver = { id: d.id, values: d.values, tasks: d.tasks }
          if (i >= 0) state.leavers[i] = l; else state.leavers.push(l)
          synced.set(d.id, snap(l))
        }
        if (j.cfg) { Object.assign(state, j.cfg); state.settings.flow = normalizeFlow(state.settings.flow); cfgSynced = JSON.stringify(cfgOf()) }
        // A leaver that arrives without rules (made before they were frozen) gets the current ones.
        state.leavers.forEach((x) => ensureSnapshot(state, x))
      })
    }
    since = j.rev; epoch = j.epoch
    if (j.reset && !state.leavers.length) resetStart()
    if (wasEmptied) toast.warning('The shared file was removed from the server. Upload the new day’s file to start.')
    first = false
  } catch (e) { set({ status: 'error', detail: e instanceof Error ? e.message : String(e) }) }
}

export function startLive() {
  if (running || !atlasReady()) return
  running = true; first = true; since = 0; epoch = 0; synced = new Map(); cfgSynced = JSON.stringify(cfgOf())
  set({ status: 'connecting', detail: '' })
  afterCommit.add(schedule)
  void pull().then(() => { cfgSynced = cfgSynced || JSON.stringify(cfgOf()) })
  timer = setInterval(() => { void pull() }, 4000)
  window.addEventListener('focus', onFocus)
}
const onFocus = () => { void pull() }
export function stopLive() {
  running = false; clearInterval(timer); clearTimeout(push); push = undefined
  afterCommit.delete(schedule); window.removeEventListener('focus', onFocus)
  set({ status: 'off' })
}
/** Remember the name of the file that was just loaded, so everyone can see which sheet is in use. */
export function noteSheet(name: string) { sheetNote = name; schedule() }

export async function saveLiveSettings(enabled: boolean, endTime: string) {
  await atlasCall('/live/settings' + atlasQuery(), { method: 'POST', body: JSON.stringify({ enabled, endTime }) })
  set({ enabled, endTime }); void pull()
}
export async function removeSharedFile() {
  await atlasCall('/live/purge' + atlasQuery(), { method: 'POST', body: '{}' })
  await pull()
}
