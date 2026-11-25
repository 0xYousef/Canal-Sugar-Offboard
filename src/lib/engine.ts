// SLA engine. Pure functions: every function takes `state` and returns data. No DOM, no storage.
import { addDays, addMonths, calendar, diff, localToday, type Cal } from './dates'
import { SLA_KEY } from './snapshot'
import type { Condition, Field, Leaver, Reason, SlaResult, State, Step, TaskRow, TaskStatus } from './types'

export const today = (s: State) => s.settings.reportDate || localToday()
export const fieldByKey = (s: State, k: string) => s.fields.find((f) => f.key === k)
export const reasonById = (s: State, id: string): Reason | undefined => s.reasons.find((r) => r.id === id)
export const stepById = (s: State, id: string) => s.steps.find((x) => x.id === id)
export const getLeaver = (s: State, id: string) => s.leavers.find((l) => l.id === id)
/** An archived leaver is kept but hidden: out of the lists, tasks, dashboard and reports. */
export const ARCHIVED = '__archived'
export const isArchived = (l: Leaver) => !!l.values[ARCHIVED]
export const liveLeavers = (s: State) => s.leavers.filter((l) => !isArchived(l))
export const archivedLeavers = (s: State) => s.leavers.filter(isArchived)
/** Set when the Owner restores a leaver, so a finished leaver is not archived again straight away. */
export const KEEP = '__keepLive'

// Value of a field for a leaver, following the field's `fallback` chain when blank.
export function value(s: State, l: Leaver, key: string, depth = 0): string {
  const v = l.values[key]
  if (v !== undefined && v !== null && v !== '') return v
  const f = fieldByKey(s, key)
  if (f && f.fallback && depth < 5) return value(s, l, f.fallback, depth + 1)
  return ''
}

export function conditionOk(_s: State, l: Leaver, c: Condition | null) {
  if (!c || !c.field) return true
  const v = String(l.values[c.field] ?? '')
  switch (c.op) {
    case 'filled': return v !== ''
    case 'empty': return v === ''
    case 'eq': return v === String(c.value ?? '')
    case 'neq': return v !== String(c.value ?? '')
    default: return true
  }
}

/** The rules a leaver has: the version frozen when they were created. Old records without one read the current rules. */
export const stepsOf = (s: State, l: Leaver): Step[] => s.slaVersions?.[l.values[SLA_KEY]] ?? s.steps
export const stepOf = (s: State, l: Leaver, id: string) => stepsOf(s, l).find((x) => x.id === id)
/** A leaver has the rules as they were when created. A rule is left out for one leaver by switching it off for them. */
export function applies(_s: State, l: Leaver, st: Step) {
  return st.active && l.tasks[st.id]?.s !== 'off'
}

export function hasSla(st: Step) {
  return !!st.start && st.start.type !== 'none' && st.days !== null && st.days !== undefined && (st.days as unknown) !== ''
}

type Start = { kind: 'none' } | { kind: 'waiting' } | { kind: 'ok'; date: string }
/** True when `from`'s clock starts from `to`'s completion, directly or through other rules. */
export function clockLoops(steps: Step[], from: string, to: string, seen = new Set<string>()): boolean {
  if (from === to) return true
  if (seen.has(from)) return false
  seen.add(from)
  const x = steps.find((y) => y.id === from)
  return !!x && x.start.type === 'step' && clockLoops(steps, x.start.step, to, seen)
}

export function startOf(s: State, l: Leaver, st: Step): Start {
  if (!hasSla(st)) return { kind: 'none' }
  if (st.start.type === 'field') {
    const v = value(s, l, st.start.field)
    return v ? { kind: 'ok', date: v } : { kind: 'waiting' }
  }
  if (st.start.type === 'step') {
    // Two rules whose clocks start from each other would wait forever; such a clock is treated as not started by a step.
    if (clockLoops(stepsOf(s, l), st.start.step, st.id)) return { kind: 'none' }
    // The rule this clock starts from may not exist for this employee (other reason, other condition, switched off) or may have been waived.
    // Then there is nothing to wait for, so the employee is not held up by it.
    const from = stepOf(s, l, st.start.step)
    if (!from || !applies(s, l, from)) return { kind: 'none' }
    const rec = l.tasks[from.id]
    if (rec && rec.s === 'waived') return { kind: 'none' }
    return rec && rec.s === 'done' ? { kind: 'ok', date: rec.d } : { kind: 'waiting' }
  }
  return { kind: 'none' }
}

export function dueOf(s: State, l: Leaver, st: Step, cal: Cal = calendar(s.settings)) {
  const start = startOf(s, l, st)
  if (start.kind !== 'ok') return { due: null as string | null, waiting: start.kind === 'waiting', noSla: start.kind === 'none' }
  const dir = st.when === 'Before' ? -1 : 1
  const n = Number(st.days) || 0
  // A deadline never falls on a weekend or holiday: counted in working days it cannot, and a calendar-day count is moved to the next working day.
  const raw = st.unit === 'WD' ? cal.addWD(start.date, n, dir) : addDays(start.date, dir * n)
  return { due: cal.toWorking(raw, dir), waiting: false, noSla: false }
}

export function slaText(s: State, st: Step) {
  if (!hasSla(st)) return 'No SLA (tracked only)'
  let from = '?'
  if (st.start.type === 'field') from = fieldByKey(s, st.start.field)?.label || st.start.field
  if (st.start.type === 'step') from = 'completion of ' + st.start.step
  const n = Number(st.days) || 0
  if (n === 0) return 'On ' + from
  return n + (st.unit === 'WD' ? ' working' : ' calendar') + (n === 1 ? ' day ' : ' days ') + st.when.toLowerCase() + ' ' + from
}

// Status of one step for one leaver.
export function evalTask(s: State, l: Leaver, st: Step, cal: Cal = calendar(s.settings)): TaskRow {
  const o: TaskRow = { step: st, leaver: l, applies: applies(s, l, st), due: null, status: 'N/A', sla: '', done: '', delay: null }
  if (!o.applies) return o
  const dd = dueOf(s, l, st, cal)
  o.due = dd.due
  const rec = l.tasks[st.id]
  const t = today(s)
  if (rec && rec.s === 'done') {
    o.status = 'Done'
    o.done = rec.d
    if (o.due) {
      o.delay = cal.wdDiff(rec.d, o.due)
      o.sla = o.delay > 0 ? 'Late' : 'On Time'
    } else o.sla = 'No SLA'
    return o
  }
  if (rec && rec.s === 'waived') { o.status = 'Waived'; o.sla = 'Waived'; return o }
  // Lateness is counted in working days, so weekends and holidays never make a task late or overdue.
  const late = o.due ? cal.wdDiff(t, o.due) : 0
  const past = !!o.due && late > 0
  if (past) o.delay = late
  if (rec && rec.s === 'blocked') { o.status = 'Blocked'; o.sla = past ? 'Breached' : 'Open'; return o }
  if (dd.waiting) { o.status = 'Waiting'; o.sla = 'Open'; return o }
  if (!o.due) { o.status = 'Open'; o.sla = 'No SLA'; return o }
  if (past) { o.status = 'Overdue'; o.sla = 'Breached'; return o }
  o.sla = 'Open'
  o.status = cal.wdDiff(o.due, t) <= Number(s.settings.dueSoon) ? 'Due Soon' : 'Pending'
  return o
}

export function leaverRows(s: State, l: Leaver) {
  const cal = calendar(s.settings)
  return stepsOf(s, l).map((st) => evalTask(s, l, st, cal)).filter((r) => r.applies)
}
export const allRows = (s: State) => liveLeavers(s).flatMap((l) => leaverRows(s, l))

export type LeaverStatus = 'Set Reason' | 'Completed' | 'Overdue' | 'Blocked' | 'Due Soon' | 'Not Started' | 'In Progress'
export interface Summary {
  rows: TaskRow[]; total: number; base: number; waived: number; done: number; overdue: number
  blocked: number; dueSoon: number; late: number; pct: number; open: number; status: LeaverStatus
}

export function summary(s: State, l: Leaver): Summary {
  const rows = leaverRows(s, l)
  const c = (f: (r: TaskRow) => boolean) => rows.filter(f).length
  const waived = c((r) => r.status === 'Waived')
  const done = c((r) => r.status === 'Done')
  const overdue = c((r) => r.status === 'Overdue')
  const blocked = c((r) => r.status === 'Blocked')
  const dueSoon = c((r) => r.status === 'Due Soon')
  const late = c((r) => r.sla === 'Late')
  const base = rows.length - waived
  let status: LeaverStatus
  if (!reasonById(s, l.values.reason)) status = 'Set Reason'
  else if (base > 0 && done === base) status = 'Completed'
  else if (overdue) status = 'Overdue'
  else if (blocked) status = 'Blocked'
  else if (done === 0) status = dueSoon ? 'Due Soon' : 'Not Started'
  else status = dueSoon ? 'Due Soon' : 'In Progress'
  return { rows, total: rows.length, base, waived, done, overdue, blocked, dueSoon, late, pct: base ? Math.round((done / base) * 100) : 0, open: base - done, status }
}

export function complianceOf(rows: TaskRow[]) {
  const on = rows.filter((r) => r.sla === ('On Time' as SlaResult)).length
  const late = rows.filter((r) => r.sla === 'Late').length
  const br = rows.filter((r) => r.sla === 'Breached').length
  const tot = on + late + br
  return { on, late, br, pct: tot ? Math.round((on / tot) * 100) : (null as number | null) }
}

export interface NoticeResult { text: string; tone: 'none' | 'good' | 'warn' | 'crit'; need?: string; months?: number }
export function noticeCheck(s: State, l: Leaver): NoticeResult {
  const r = reasonById(s, l.values.reason)
  if (!r || !r.notice) return { text: 'n/a', tone: 'none' }
  const n = s.settings.notice
  const hire = value(s, l, n.hireField), req = value(s, l, n.requestField), end = value(s, l, n.endField)
  if (!hire || !req || !end) return { text: 'Missing data', tone: 'warn' }
  const years = diff(end, hire) / 365.25
  const months = years <= Number(n.years) ? Number(n.short) : Number(n.long)
  const need = addMonths(req, months)
  return diff(end, need) >= 0 ? { text: 'OK', tone: 'good' } : { text: 'Short Notice', tone: 'crit', need, months }
}

export function missingInfo(s: State, l: Leaver) {
  const m: string[] = []
  const rid = l.values.reason
  const r = reasonById(s, rid)
  const notice = r && r.notice ? [s.settings.notice.hireField] : []
  s.fields.forEach((f: Field) => {
    const v = l.values[f.key]
    const empty = v === undefined || v === null || v === ''
    const need = f.required || (f.requiredFor || []).includes(rid) || notice.includes(f.key)
    if (need && empty && !(f.fallback && value(s, l, f.key))) m.push(f.label)
  })
  return m
}

// Where is a field / step / group / reason used? Blocks unsafe deletes.
export function usage(s: State) {
  return {
    field: (key: string) => s.steps.filter((x) => (x.start.type === 'field' && x.start.field === key) || (x.condition && x.condition.field === key)).map((x) => x.id)
      .concat(s.fields.filter((f) => f.fallback === key).map((f) => 'field:' + f.key))
      .concat(Object.values(s.settings.notice).includes(key) ? ['notice settings'] : []),
    step: (id: string) => s.steps.filter((x) => x.start.type === 'step' && x.start.step === id).map((x) => x.id),
    group: (g: string) => s.steps.filter((x) => x.group === g).map((x) => x.id),
    reason: (id: string) => s.leavers.filter((l) => l.values.reason === id).map((l) => l.values.name || l.id),
  }
}

export type { TaskStatus }

/** A leaver whose tasks are all done (100%) is archived automatically. Returns true when something changed. */
export function autoArchive(s: State): boolean {
  let changed = false
  for (const l of s.leavers) {
    if (isArchived(l) || l.values[KEEP]) continue
    const sm = summary(s, l)
    if (sm.base > 0 && sm.pct === 100) { l.values[ARCHIVED] = new Date().toISOString(); l.values[ARCHIVED + 'By'] = 'Auto (100%)'; changed = true }
  }
  return changed
}

/** Employee ID is the unique identifier. Compared without case or spaces. */
export const idKey = (v: string | undefined) => (v ?? '').trim().toLowerCase()
export const findByEmpId = (s: State, id: string, except?: Leaver) => s.leavers.find((l) => l !== except && idKey(l.values.empId) === idKey(id))

/** Labels of the required fields that are empty: fields marked required, plus those required for the chosen reason. */
export function missingRequired(s: State, values: Record<string, string>): string[] {
  const reason = (values.reason ?? '').trim()
  return s.fields.filter((f) => (f.required || (reason && f.requiredFor?.includes(reason))) && !(values[f.key] ?? '').trim()).map((f) => f.label)
}

/** How to call a leaver on screen: the name when there is one, otherwise the Employee ID. */
export const who = (l: Leaver) => l.values.name?.trim() || l.values.empId || '(no name)'

/** Everything a field drives in the system, in plain words. Shown in Settings, Leaver form. */
export function impactOf(s: State, f: Field): string[] {
  const out: string[] = []
  const stepIds = (fn: (x: Step) => boolean) => s.steps.filter(fn).map((x) => x.id)
  if (f.key === 'empId') out.push('Unique identifier: import matching, duplicate check, search')
  if (f.key === 'name') out.push('Shown as the leaver’s name (the Employee ID is used when empty)')
  if (f.key === 'reason' || f.type === 'reason') out.push('Chooses the notice rule and which reason-specific fields are required')
  if (f.required) out.push('Required: blocks saving and skips import rows when empty')
  if (f.requiredFor?.length) out.push(`Required for reason ${f.requiredFor.join(', ')}`)
  const start = stepIds((x) => x.start.type === 'field' && x.start.field === f.key)
  if (start.length) out.push(`Starts the SLA clock of ${start.length} task${start.length === 1 ? '' : 's'} (${start.slice(0, 6).join(', ')}${start.length > 6 ? '…' : ''})`)
  const cond = stepIds((x) => !!x.condition && x.condition.field === f.key)
  if (cond.length) out.push(`Decides if ${cond.length} task${cond.length === 1 ? '' : 's'} apply (${cond.slice(0, 6).join(', ')}${cond.length > 6 ? '…' : ''})`)
  const n = s.settings.notice
  const nr = [n.hireField === f.key && 'hire date', n.requestField === f.key && 'request date', n.endField === f.key && 'end date'].filter(Boolean)
  if (nr.length) out.push(`Notice check uses it as the ${nr.join(' and ')}`)
  s.fields.filter((x) => x.fallback === f.key).forEach((x) => out.push(`Backs up ${x.label} when that is empty`))
  if (f.fallback) out.push(`Falls back to ${s.fields.find((x) => x.key === f.fallback)?.label ?? f.fallback} when empty`)
  if (f.showInList) out.push('Column in the Leavers list')
  if (['select', 'reason', 'checkbox', 'text'].includes(f.type) && f.key !== 'name' && f.key !== 'empId') out.push('Can group the Reports charts')
  out.push('Included in exports and the import template')
  return out
}
