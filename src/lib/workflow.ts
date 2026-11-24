import { state } from './store'
import { DEFAULT_FLOW, FALLBACK_DONE } from './flowDefaults'
import { resolveStepActions } from './snapshot'
import type { State, Step, StepAction, WorkflowAction, WorkflowKind } from './types'

export { DEFAULT_FLOW }
export const KINDS: WorkflowKind[] = ['done', 'waive', 'block', 'reopen']

/** What each kind does to a task. */
export const KIND_LABEL: Record<WorkflowKind, string> = {
  done: 'Finishes the task',
  waive: 'Waives it (does not apply)',
  block: 'Blocks it (held up)',
  reopen: 'Reopens it',
}

/** The configured actions, in the order they are shown. Saved settings always hold the list; the defaults only stand in for data saved before it existed. */
export function flowOf(s: State): WorkflowAction[] {
  return s.settings.flow ?? DEFAULT_FLOW
}
/** The action the Dashboard's quick Done uses: the first one you configured. */
export const primaryDone = (s: State) => flowOf(s)[0] ?? FALLBACK_DONE

export const asksAnything = (w: WorkflowAction) => w.date !== 'off' || w.member !== 'off' || w.comment !== 'off'

/** An SLA rule's actions as people meet them. Ones picked from the configured list take their name, description and questions from it, so editing the action there changes every rule. Picks whose action was removed drop out. */
export function stepActionsOf(st: Step, s: State = state): StepAction[] {
  return resolveStepActions(st, flowOf(s))
}
/** The steps of a rule: its actions that finish work. Waive, Block and Reopen picks are not steps; they act on the whole task. */
export const isStepAction = (a: StepAction) => a.finishes !== false

/** IDs of the SLA rules that use a configured action. */
export const rulesUsing = (s: State, actionId: string) => s.steps.filter((st) => st.actions?.some((a) => a.ref === actionId)).map((st) => st.id)
