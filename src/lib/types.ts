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
}

export type TaskRecord = { s: 'done'; d: string } | { s: 'waived' } | { s: 'blocked' }

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
}

export interface State {
  version: number
  settings: Settings
  reasons: Reason[]
  groups: string[]
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
