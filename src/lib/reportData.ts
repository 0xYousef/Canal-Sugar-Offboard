// The live report tables, computed with the same engine the app uses. Bundled into the gateway (npm run build:gateway),
// so Excel can refresh the very same numbers the website shows.
import * as E from './engine'
import type { State } from './types'

export type Cell = string | number
export interface ReportTables { updated: string; tables: Record<'summary' | 'cases' | 'tasks' | 'teams', Cell[][]> }

const avgLate = (rows: ReturnType<typeof E.allRows>) => {
  const l = rows.filter((r) => r.delay !== null && r.delay > 0 && r.status === 'Done').map((r) => r.delay as number)
  return l.length ? Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 10) / 10 : 0
}

/** `state` holds every leaver, archived ones included (they carry values.__archived). */
export function buildReport(state: State, today: string): ReportTables {
  const s = state
  const lwd = (l: (typeof s.leavers)[number]) => E.value(s, l, 'lwd')
  const reasonName = (id: string) => s.reasons.find((r) => r.id === id)?.name ?? id ?? ''
  const sums = s.leavers.map((l) => ({ l, m: E.summary(s, l) }))
  const rows = sums.flatMap(({ m }) => m.rows).filter((r) => r.status !== 'N/A')
  const comp = E.complianceOf(rows)

  const cases: Cell[][] = [['Employee ID', 'Name', 'Email', 'Department', 'Location', 'Reason', 'Last working day', 'Status', 'Progress %', 'Tasks done', 'Tasks applicable', 'Overdue', 'Late', 'Notice check', 'Archived', 'Archived on']]
  sums.forEach(({ l, m }) => cases.push([l.values.empId ?? '', l.values.name ?? '', l.values.email ?? '', l.values.dept ?? '', l.values.site ?? '', reasonName(l.values.reason), lwd(l), m.status, m.pct, m.done, m.base, m.overdue, m.late, E.noticeCheck(s, l).text, E.isArchived(l) ? 'Yes' : 'No', (l.values[E.ARCHIVED] ?? '').slice(0, 10)]))

  const tasks: Cell[][] = [['Employee ID', 'Name', 'Last working day', 'SLA', 'Task', 'Team', 'Rule', 'Due', 'Completed on', 'Status', 'SLA result', 'Days late (+) / early (-)', 'Note', 'Archived']]
  sums.forEach(({ l, m }) => m.rows.filter((r) => r.status !== 'N/A').forEach((r) => {
    const rec = l.tasks[r.step.id]
    tasks.push([l.values.empId ?? '', l.values.name ?? '', lwd(l), r.step.id, r.step.name, r.step.group, E.slaText(s, r.step), r.due ?? '', r.done ?? '', r.status, r.sla, r.delay ?? '', rec && 'note' in rec && rec.note ? rec.note : '', E.isArchived(l) ? 'Yes' : 'No'])
  }))

  const teams: Cell[][] = [['Team', 'Tasks', 'Done', 'On time', 'Late', 'Breached', 'Avg days late', 'Open', 'Compliance %']]
  s.groups.forEach((g) => {
    const gr = rows.filter((r) => r.step.group === g), c = E.complianceOf(gr)
    teams.push([g, gr.length, gr.filter((r) => r.status === 'Done').length, c.on, c.late, c.br, avgLate(gr), gr.filter((r) => r.status !== 'Done' && r.status !== 'Waived').length, c.pct ?? ''])
  })

  const done = sums.filter(({ m }) => m.status === 'Completed' || (m.base > 0 && m.pct === 100)).length
  const summary: Cell[][] = [['Metric', 'Value'],
    ['Updated', today], ['All cases', sums.length], ['Active cases', sums.length - done], ['Completed cases', done],
    ['Archived cases', sums.filter(({ l }) => E.isArchived(l)).length], ['Overdue cases', sums.filter(({ l, m }) => !E.isArchived(l) && m.status === 'Overdue').length],
    ['Tasks on time', comp.on], ['Tasks done late', comp.late], ['Tasks breached', comp.br], ['Compliance %', comp.pct ?? '']]
  return { updated: today, tables: { summary, cases, tasks, teams } }
}
