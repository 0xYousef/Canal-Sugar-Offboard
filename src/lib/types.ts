export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'reason'

export interface Field {
  key: string
  label: string
  type: FieldType
  section: string
  builtin?: boolean
  required: boolean
  requiredFor: string[]
  showInList: boolean
  options?: string[]
  fallback?: string
}

export interface Reason { id: string; name: string; notice: boolean }
export interface Holiday { date: string; name: string }

export type StepStart =
  | { type: 'none' }
  | { type: 'field'; field: string }
  | { type: 'step'; step: string }

export interface Condition { field: string; op: 'eq' | 'neq' | 'filled' | 'empty'; value?: string }

export interface Step {
  id: string
  active: boolean
  group: string
  name: string
  start: StepStart
  days: number | null
  when: 'After' | 'Before'
  unit: 'WD' | 'CD'
  applies: { mode: 'all' | 'reasons'; reasons: string[] }
  condition: Condition | null
  /** What people can do on this task. Each one finishes it and asks for the details it needs. */
  actions?: StepAction[]
  /** Other rules this one waits for. `action` is one of that rule's action ids; without it the whole task must be done. */
  dependsOn?: Dependency[]
}

export interface Dependency { step: string; action?: string }

/** off = not asked, optional = may be left empty, required = must be filled in. */
export type Need = 'off' | 'optional' | 'required'
export interface StepAction {
  /** When set, name, description and what it asks for are read from the configured action (Workflow, Actions) with this id. */
  ref?: string
  /** In a frozen copy of a rule: the configured action it was taken from. Only used so the same action is not listed twice. */
  from?: string
  /** Set when read from a configured action: what it does. Anything but 'done' applies to the whole task and is not one of the steps. */
  kind?: WorkflowKind
  /** Read from the configured action; false means it does not finish the task and is not one of the rule's steps. */
  finishes?: boolean
  id: string; name: string; description?: string; date: Need; member: Need; comment: Need
  /** Actions listed above this one that must be done before it can be taken. The task finishes when every action is done. */
  requires?: string[]
}

export interface Member { name: string; title?: string }

/** `acted`: an action that does not finish the task was taken. The task stays open and shows the action's name. */
/** `off`: this rule is switched off for this one leaver. It is stored under the rule's own key so it travels with the leaver. */
export type TaskRecord = { s: 'off' } | { s: 'acted'; act: string; d: string; by?: string; note?: string } | { s: 'done'; d: string; by?: string; act?: string; note?: string } | { s: 'waived'; d?: string; by?: string; note?: string } | { s: 'blocked'; d?: string; by?: string; note?: string }

/** The four built-in things people can do to a task, and what each one asks for. */
export type WorkflowKind = 'done' | 'waive' | 'block' | 'reopen'
/** One entry in the task menu. `kind` is what it does; `description` is written to the activity log only, never shown on the task. */
export interface WorkflowAction {
  id: string; kind: WorkflowKind; label: string; description?: string; date: Need; member: Need; comment: Need
  /** Whether taking it finishes the task. Missing means yes. When no, the task stays open and shows this action's name. */
  finishes?: boolean
}

export interface Leaver {
  id: string
  values: Record<string, string>
  tasks: Record<string, TaskRecord>
}

export interface NoticeSettings {
  hireField: string; requestField: string; endField: string
  years: number; short: number; long: number
}

export interface Settings {
  weekend: 'FS' | 'SS'
  dueSoon: number
  reportDate: string
  holidays: Holiday[]
  notice: NoticeSettings
  /** The task actions (Settings, Workflow). When missing, the four defaults are used. */
  flow?: WorkflowAction[]
  /** Block adding leavers and imports after the closing time. When missing it follows the daily removal switch; set it to turn it on or off by itself. */
  lockAfterClose?: boolean
}

export interface State {
  version: number
  settings: Settings
  reasons: Reason[]
  groups: string[]
  /** People in each team (team name -> names). Used to record who finished a task. */
  members?: Record<string, Member[]>
  /** The SLA rules as they were at different moments. Each leaver points at one (values.__sla) and keeps those rules even when the configuration changes later. */
  slaVersions?: Record<string, Step[]>
  fields: Field[]
  steps: Step[]
  leavers: Leaver[]
}

export type TaskStatus = 'N/A' | 'Done' | 'Waived' | 'Blocked' | 'Waiting' | 'Open' | 'Overdue' | 'Due Soon' | 'Pending'
export type SlaResult = '' | 'On Time' | 'Late' | 'Breached' | 'Open' | 'Waived' | 'No SLA'

export interface TaskRow {
  step: Step
  leaver: Leaver
  applies: boolean
  due: string | null
  status: TaskStatus
  sla: SlaResult
  done: string
  delay: number | null
}
