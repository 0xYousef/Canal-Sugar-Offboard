import { commit } from './store'
import { canAct, type Module } from './rbac'
import { log } from './audit'
import * as E from './engine'
import type { State, TaskRecord } from './types'

/** Set (or clear, with null) the record for one task. Silently ignored if the role may not edit it. */
export function setTask(leaverId: string, stepId: string, rec: TaskRecord | null, s: State, mod: Module = 'tasks') {
  const l = E.getLeaver(s, leaverId), st = E.stepById(s, stepId)
  if (!l || !st || !canAct(mod, st.group)) return
  if (rec) l.tasks[stepId] = rec; else delete l.tasks[stepId]
  const what = `${st.id}: ${st.name}`
  const [action, text] = !rec ? ['Task reopened', `${what} was reopened.`] : rec.s === 'done' ? ['Task done', `${what} was marked done on ${rec.d}.`] : rec.s === 'waived' ? ['Task waived', `${what} was waived (does not apply).`] : ['Task blocked', `${what} was marked blocked.`]
  log(action, text, l.values.name || l.id)
  commit()
}
