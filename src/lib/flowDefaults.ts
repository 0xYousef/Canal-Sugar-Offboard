import type { WorkflowAction } from './types'

/** There are no built-in actions: the list under Settings, Workflow holds only what the admin adds. */
export const DEFAULT_FLOW: WorkflowAction[] = []

/** Undo. Not an action anyone configures: it puts a task with something recorded back to open. */
export const REOPEN: WorkflowAction = { id: 'reopen', kind: 'reopen', label: 'Reopen', description: '', date: 'off', member: 'off', comment: 'off' }

/** Used only by the Dashboard's quick "Done" when no action has been configured yet. Never listed. */
export const FALLBACK_DONE: WorkflowAction = { id: 'done', kind: 'done', label: 'Done', description: '', date: 'required', member: 'optional', comment: 'off' }

/** Brings saved actions up to date. Older saves held built-in Waive / Block / Reopen entries with a type; those become plain actions
 *  (Waive and Block keep working as actions that do not finish the task) and the built-in Reopen entry goes, since Reopen is no longer an action. */
export function normalizeFlow(list: unknown): WorkflowAction[] {
  if (!Array.isArray(list)) return []
  return list.flatMap((a: Partial<WorkflowAction>) => {
    if (!a || typeof a.label !== 'string' || a.kind === 'reopen') return []
    const finishes = a.finishes ?? !(a.kind === 'block' || a.kind === 'waive')
    return [{ ...a, kind: 'done', finishes } as WorkflowAction]
  })
}
