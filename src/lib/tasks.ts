import { commit } from './store'
import { canAct, type Module } from './rbac'
import { log } from './audit'
import * as E from './engine'
import { isStepAction, stepActionsOf } from './workflow'
import type { Leaver, Member, State, Step, StepAction, TaskRecord, WorkflowAction } from './types'

/** Which action was used. Its description goes into the activity log and nowhere else. */
export interface Via { label: string; description?: string }
export interface Ctx { note?: string; via?: Via }
const viaText = (v?: Via) => (v ? ` [${v.label}${v.description?.trim() ? ': ' + v.description.trim() : ''}]` : '')

/** Each action's own record lives next to the task's, under "STEP__ACTION", so it travels with the leaver. The shared database only accepts letters, digits, _ and - in a key, so no other separator will do. */
export const actKey = (stepId: string, actionId: string) => stepId + '__' + actionId
const clearActions = (l: Leaver, stepId: string) => { Object.keys(l.tasks).forEach((k) => { if (k.startsWith(stepId + '__')) delete l.tasks[k] }) }

/** True when `from` waits for `to`, directly or through other rules. Used so two rules can never hold each other up. */
export function waitsFor(steps: Step[], from: string, to: string, seen = new Set<string>()): boolean {
  if (from === to) return true
  if (seen.has(from)) return false
  seen.add(from)
  return (steps.find((x) => x.id === from)?.dependsOn ?? []).some((d) => waitsFor(steps, d.step, to, seen))
}
const finished = (l: Leaver, id: string) => { const r = l.tasks[id]; return !!r && (r.s === 'done' || r.s === 'waived') }
/** What this rule is still waiting for on this leaver, as readable labels. A rule that does not apply to the leaver never holds anyone up. */
export function waitingFor(s: State, l: Leaver, st: Step): string[] {
  return (st.dependsOn ?? []).flatMap((d) => {
    const t = E.stepOf(s, l, d.step)
    // A wait that loops back to this rule is ignored, so a mistake in the settings can never freeze a task.
    if (!t || waitsFor(E.stepsOf(s, l), t.id, st.id) || !E.applies(s, l, t) || finished(l, t.id)) return []
    const a = d.action ? stepActionsOf(t).find((x) => x.id === d.action) : undefined
    if (a && l.tasks[actKey(t.id, a.id)]) return []
    return [a ? `${t.id} · ${a.name}` : `${t.id} done`]
  })
}

export interface ActionState { action: StepAction; done: TaskRecord | undefined; waitingFor: string[] }
/** Where a task stands: which actions are done, and which are still waiting on others. */
export function actionStates(l: Leaver, st: Step): ActionState[] {
  const list = stepActionsOf(st).filter(isStepAction)
  return list.map((action) => ({
    action, done: l.tasks[actKey(st.id, action.id)],
    waitingFor: (action.requires ?? []).map((id) => list.find((x) => x.id === id)).filter((x): x is StepAction => !!x && !l.tasks[actKey(st.id, x.id)]).map((x) => x.name),
  }))
}

/** Do one action. It is refused while an action it needs is not done; when the last one is done the task itself is finished. */
export function doAction(leaverId: string, stepId: string, actionId: string, rec: { d: string; by?: string; note?: string }, s: State, mod: Module = 'tasks'): string | null {
  const l = E.getLeaver(s, leaverId), st = l && E.stepOf(s, l, stepId)
  if (!l || !st || !canAct(mod, st.group)) return 'You cannot do that.'
  const wait = waitingFor(s, l, st)
  if (wait.length) return `Waiting for ${wait.join(', ')}.`
  const all = actionStates(l, st), me = all.find((x) => x.action.id === actionId)
  if (!me) return 'That action no longer exists.'
  if (me.waitingFor.length) return `Do ${me.waitingFor.join(', ')} first.`
  l.tasks[actKey(stepId, actionId)] = { s: 'done', act: me.action.name, ...rec }
  const what = `${st.id}: ${st.name}`
  log('Action done', `${what}, action "${me.action.name}", on ${rec.d}${rec.by ? ` by ${rec.by}` : ''}${rec.note ? `. Comment: ${rec.note}` : ''}.${viaText({ label: me.action.name, description: me.action.description })}`, l.values.name || l.id)
  if (actionStates(l, st).every((x) => x.done)) {
    l.tasks[stepId] = { s: 'done', d: rec.d, act: me.action.name, ...(rec.by ? { by: rec.by } : {}) }
    log('Task done', `${what} was finished: all ${all.length} actions are done.`, l.values.name || l.id)
  }
  commit()
  return null
}

/** Set (or clear, with null) the record for one task. Silently ignored if the role may not edit it. */
export function setTask(leaverId: string, stepId: string, rec: TaskRecord | null, s: State, mod: Module = 'tasks', ctx: Ctx = {}) {
  const note = ctx.note ?? ''
  const l = E.getLeaver(s, leaverId), st = l && E.stepOf(s, l, stepId)
  if (!l || !st || !canAct(mod, st.group)) return
  if (rec && waitingFor(s, l, st).length) return
  if (rec) l.tasks[stepId] = rec; else { delete l.tasks[stepId]; clearActions(l, stepId) }
  const what = `${st.id}: ${st.name}`
  const [action, text] = !rec ? ['Task reopened', `${what} was reopened${note ? `. Comment: ${note}` : ''}.`] : rec.s === 'off' ? ['Rule switched off', `${what} was switched off.`] : rec.s === 'acted' ? ['Task action', `${what}: action "${rec.act}" was taken on ${rec.d}${rec.by ? ` by ${rec.by}` : ''}${rec.note ? `. Comment: ${rec.note}` : ''}.`] : rec.s === 'done' ? ['Task done', `${what}${rec.act ? `, action "${rec.act}",` : ''} was marked done on ${rec.d}${rec.by ? ` by ${rec.by}` : ''}${rec.note ? `. Comment: ${rec.note}` : ''}.`] : rec.s === 'waived' ? ['Task waived', `${what} was waived (does not apply)${rec.by ? ` by ${rec.by}` : ''}${rec.note ? `. Comment: ${rec.note}` : ''}.`] : ['Task blocked', `${what} was marked blocked${rec.by ? ` by ${rec.by}` : ''}${rec.note ? `. Comment: ${rec.note}` : ''}.`]
  log(action, text + viaText(ctx.via), l.values.name || l.id)
  commit()
}

/** Apply one action to many tasks with a single save. Tasks the role may not touch are skipped; returns how many changed. */
export function setTasks(items: { leaverId: string; stepId: string }[], rec: TaskRecord | null, s: State, mod: Module = 'tasks', ctx: Ctx = {}) {
  const note = ctx.note ?? ''
  let n = 0
  const names = new Set<string>()
  items.forEach(({ leaverId, stepId }) => {
    const l = E.getLeaver(s, leaverId), st = l && E.stepOf(s, l, stepId)
    if (!l || !st || !canAct(mod, st.group) || (rec && waitingFor(s, l, st).length)) return
    if (rec) l.tasks[stepId] = { ...rec }; else { delete l.tasks[stepId]; clearActions(l, stepId) }
    names.add(l.values.name || l.id); n++
  })
  if (!n) return 0
  const verb = !rec ? 'reopened' : rec.s === 'acted' ? `action "${rec.act}" taken` : rec.s === 'done' ? `marked done on ${rec.d}${rec.by ? ` by ${rec.by}` : ''}` : rec.s === 'waived' ? 'waived (does not apply)' : 'marked blocked'
  const extra = `${rec && 'by' in rec && rec.by ? ` by ${rec.by}` : ''}${rec && 'note' in rec && rec.note ? `. Comment: ${rec.note}` : !rec && note ? `. Comment: ${note}` : ''}`
  log('Bulk task action', `${n} task${n === 1 ? '' : 's'} ${verb}${extra} for ${names.size} leaver${names.size === 1 ? '' : 's'}.${viaText(ctx.via)}`)
  commit()
  return n
}

/** People who can be named as having finished a task of this team. */
/** Older saves kept members as plain names; both shapes are read the same way. */
export const membersOf = (s: State, group: string): Member[] =>
  ((s.members?.[group] ?? []) as (Member | string)[]).map((m) => (typeof m === 'string' ? { name: m } : m))

export interface Answers { date: string; by: string; note: string }
/** What to store for a task action, from the answers given. Only what the action asks for is kept; null means reopen. */
export function recordFor(w: WorkflowAction, a: Answers, today: string): TaskRecord | null {
  const kind = w.kind
  if (kind === 'reopen') return null
  const d = w.date !== 'off' && a.date ? a.date : ''
  const extra = { ...(w.member !== 'off' && a.by ? { by: a.by } : {}), ...(w.comment !== 'off' && a.note.trim() ? { note: a.note.trim() } : {}) }
  if (w.finishes === false) return { s: 'acted', act: w.label, d: d || today, ...extra }
  return { s: 'done', d: d || today, act: w.label, ...extra }
}
/** True when something this action requires has not been filled in. */
export const missingAnswers = (w: WorkflowAction, a: Answers) => (w.date === 'required' && !a.date) || (w.member === 'required' && !a.by) || (w.comment === 'required' && !a.note.trim())

/** Switch a rule on or off for one leaver. Switching on keeps nothing but the empty slot; switching off hides the rule and its recorded progress for that leaver. */
export function setRuleActive(leaverId: string, stepId: string, on: boolean, s: State) {
  const l = E.getLeaver(s, leaverId), st = l && E.stepOf(s, l, stepId)
  if (!l || !st) return
  if (on) { if (l.tasks[stepId]?.s === 'off') delete l.tasks[stepId] }
  else if (l.tasks[stepId]?.s === 'done' || l.tasks[stepId]?.s === 'waived') return     // finished work stays in the reports
  else { delete l.tasks[stepId]; clearActions(l, stepId); l.tasks[stepId] = { s: 'off' } }
  log(on ? 'Rule switched on' : 'Rule switched off', `${st.id}: ${st.name} was switched ${on ? 'on' : 'off'} for this leaver.`, l.values.name || l.id)
  commit()
}
