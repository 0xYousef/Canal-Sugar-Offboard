import type { Leaver, State, Step, StepAction, WorkflowAction } from './types'

/** Where a leaver's rule version is kept. Starts with letters/digits/_ so the shared database accepts it as a key. */
export const SLA_KEY = '__sla'

/** A rule's actions with the picks from the configured list filled in. Picks whose action was removed drop out. */
export function resolveStepActions(st: Step, flow: WorkflowAction[]): StepAction[] {
  return (st.actions ?? []).flatMap((a): StepAction[] => {
    if (!a.ref) return a.name.trim() ? [a] : []
    const w = flow.find((x) => x.id === a.ref)
    return w ? [{ ...a, kind: w.kind, finishes: w.finishes, name: w.label, description: w.description, date: w.date, member: w.member, comment: w.comment }] : []
  })
}

const hash = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }

/** Freeze the rules as configured right now. The same configuration always gives the same version, so leavers created in a row share it. */
export function versionFor(s: State): string {
  const flow = s.settings.flow ?? []
  const frozen = s.steps.map((st) => ({ ...st, actions: resolveStepActions(st, flow).map(({ ref, ...rest }) => (ref ? { ...rest, from: ref } : rest)) }))
  const json = JSON.stringify(frozen)
  const id = 'v' + hash(json) + json.length.toString(36)
  s.slaVersions ??= {}
  s.slaVersions[id] ??= JSON.parse(json)
  return id
}

/** Give a new leaver the rules as they are now. Leavers that already have a version are left alone. */
export function ensureSnapshot(s: State, l: Leaver) {
  const v = l.values[SLA_KEY]
  if (!v || !s.slaVersions?.[v]) l.values[SLA_KEY] = versionFor(s)
}
/** Replace a leaver's rules with the current configuration. */
export function refreshSnapshot(s: State, l: Leaver) { l.values[SLA_KEY] = versionFor(s) }
