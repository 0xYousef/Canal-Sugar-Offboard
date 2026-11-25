// Period report: leavers whose last working day falls between two dates, one row per SLA task.
import * as E from './engine'
import { auditEntries } from './audit'
import { canSeeArchive } from './rbac'
import type { Leaver, State } from './types'

export interface DailyRow { empId: string; name: string; email: string; lwd: string; sla: string; team: string; completed: 'Yes' | 'No'; progress: number; archived: 'Yes' | 'No'; note: string }
export interface TeamRow { team: string; tasks: number; completed: number; onTime: number; late: number; onTimePct: number | null; overdueNow: number; blockedNow: number; blocksInPeriod: number; repeatedBlocks: number }
export interface Summary { actions: number; leavers: number; activeLeavers: number; completedLeavers: number }
export interface Daily { from: string; to: string; rows: DailyRow[]; completed: number; notCompleted: number; summary: Summary; teams: TeamRow[] }

const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const TASK_EVENTS = new Set(['Task done', 'Task action', 'Task waived', 'Task blocked', 'Task reopened'])
const lwdOf = (s: State, l: Leaver) => E.value(s, l, 'lwd')
const callName = (l: Leaver) => l.values.name || l.id

export function buildDaily(s: State, from: string, to: string): Daily {
  const [a, b] = from <= to ? [from, to] : [to, from]
  const cohort = s.leavers.filter((l) => { const d = lwdOf(s, l); return !!d && d >= a && d <= b })
  const visible = cohort.filter((l) => !E.isArchived(l) || canSeeArchive())
  const names = new Set(cohort.map(callName))
  const events = auditEntries().filter((e) => { const d = localDay(e.at); return d >= a && d <= b && names.has(e.employee) })

  const rows: DailyRow[] = []
  for (const l of visible) {
    const sm = E.summary(s, l)
    for (const r of sm.rows) {
      if (r.status === 'N/A') continue
      const rec = l.tasks[r.step.id]
      rows.push({
        empId: l.values.empId ?? '', name: l.values.name ?? '', email: l.values.email ?? '', lwd: lwdOf(s, l), sla: `${r.step.id} ${r.step.name}`, team: r.step.group,
        completed: r.status === 'Done' ? 'Yes' : 'No', progress: sm.pct, archived: E.isArchived(l) ? 'Yes' : 'No', note: rec && 'note' in rec && rec.note ? rec.note : '',
      })
    }
  }
  rows.sort((x, y) => x.lwd.localeCompare(y.lwd) || x.empId.localeCompare(y.empId))
  const done = rows.filter((r) => r.completed === 'Yes').length

  const sums = cohort.map((l) => E.summary(s, l))
  const finished = sums.filter((m) => m.status === 'Completed' || m.pct === 100).length
  const summary: Summary = { actions: events.filter((e) => TASK_EVENTS.has(e.action)).length, leavers: cohort.length, activeLeavers: cohort.length - finished, completedLeavers: finished }
  return { from: a, to: b, rows, completed: done, notCompleted: rows.length - done, summary, teams: teamsOf(s, visible, events) }
}

/** Per team over those leavers. A block is "repeated" when the same task of the same employee was blocked more than once. */
function teamsOf(s: State, leavers: Leaver[], events: ReturnType<typeof auditEntries>): TeamRow[] {
  const stepTeam = new Map<string, string>(); s.steps.forEach((st) => stepTeam.set(st.id, st.group))
  const teamOf = (details: string) => stepTeam.get(details.split(':')[0].trim())
  const mine = new Set(leavers.map(callName))
  const blocks = events.filter((e) => e.action === 'Task blocked')
  const pairs = new Map<string, number>()
  auditEntries().filter((e) => e.action === 'Task blocked' && mine.has(e.employee)).forEach((e) => { const t = teamOf(e.details); if (t) { const k = `${t}|${e.employee}|${e.details.split(':')[0]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1) } })
  const all = leavers.flatMap((l) => E.summary(s, l).rows).filter((r) => r.status !== 'N/A')
  return s.groups.map((g) => {
    const rs = all.filter((r) => r.step.group === g)
    const done = rs.filter((r) => r.status === 'Done')
    const onTime = done.filter((r) => r.sla === 'On Time').length, late = done.filter((r) => r.sla === 'Late' || r.sla === 'Breached').length
    return {
      team: g, tasks: rs.length, completed: done.length, onTime, late, onTimePct: done.length ? Math.round((onTime / done.length) * 100) : null,
      overdueNow: rs.filter((r) => r.status === 'Overdue').length, blockedNow: rs.filter((r) => r.status === 'Blocked').length,
      blocksInPeriod: blocks.filter((e) => teamOf(e.details) === g).length,
      repeatedBlocks: [...pairs.entries()].filter(([k, n]) => n > 1 && k.startsWith(g + '|')).length,
    }
  })
}

export const TEAM_HEAD = ['Team', 'SLA tasks', 'Completed', 'On time', 'Late', 'On-time %', 'Overdue now', 'Blocked now', 'Blocks in period', 'Repeated blocks']
export const teamCells = (t: TeamRow) => [t.team, t.tasks, t.completed, t.onTime, t.late, t.onTimePct === null ? '—' : `${t.onTimePct}%`, t.overdueNow, t.blockedNow, t.blocksInPeriod, t.repeatedBlocks]
export const DAILY_HEAD = ['Employee ID', 'Full name', 'Email', 'Last working day', 'SLA', 'Team', 'Completed', 'Progress', 'Archived', 'Notes']
export const dailyCells = (r: DailyRow) => [r.empId, r.name, r.email, r.lwd, r.sla, r.team, r.completed, `${r.progress}%`, r.archived, r.note]
/** Columns that describe the employee, not one SLA task: they are merged down the employee's rows. */
export const MERGED = new Set([0, 1, 2, 3, 7, 8])
/** For each row: how many rows its employee block spans (on the first row of the block), or 0 on the others. */
export function spans(rows: DailyRow[]): number[] {
  const out = rows.map(() => 0)
  let start = 0
  rows.forEach((r, i) => {
    const last = i === rows.length - 1 || rows[i + 1].empId !== r.empId || rows[i + 1].lwd !== r.lwd
    if (last) { out[start] = i - start + 1; start = i + 1 }
  })
  return out
}
export const periodText = (d: Daily) => (d.from === d.to ? d.from : `${d.from} to ${d.to}`)

export async function exportDailyExcel(d: Daily) {
  const { default: write } = await import('write-excel-file/browser')
  const b = (value: string) => ({ value, fontWeight: 'bold' as const })
  const sm = d.summary, sp = spans(d.rows)
  const data = [
    [b(`Report for last working days ${periodText(d)}`)],
    [b('Leavers'), { value: sm.leavers }, b('Active'), { value: sm.activeLeavers }, b('Completed'), { value: sm.completedLeavers }, b('Actions taken'), { value: sm.actions }],
    [],
    DAILY_HEAD.map(b),
    ...d.rows.map((r, i) => dailyCells(r).map((v, j) => {
      if (!MERGED.has(j)) return { value: v }
      const n = sp[i]
      return n ? { value: v, rowSpan: n, align: 'center' as const, alignVertical: 'center' as const, fontWeight: j === 0 ? ('bold' as const) : undefined } : null
    })),
    [],
    [b('Total'), { value: `${d.rows.length} SLA tasks` }, {}, {}, {}, { value: `${d.completed} completed, ${d.notCompleted} not` }],
  ]
  const teams = [TEAM_HEAD.map(b), ...d.teams.map((t) => teamCells(t).map((v) => ({ value: v })))]
  await write([
    { data, sheet: 'Report', columns: [16, 26, 30, 18, 44, 14, 12, 10, 10, 40].map((width) => ({ width })) },
    { data: teams, sheet: 'Team performance', columns: [22, 11, 12, 10, 8, 11, 12, 12, 16, 16].map((width) => ({ width })) },
  ]).toFile(`report-${d.from}-to-${d.to}.xlsx`)
}

const esc = (v: string | number) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
/** Opens a clean page with the tables and the print dialog. */
export function printDaily(d: Daily) {
  const w = window.open('', '_blank')
  if (!w) return false
  const sp = spans(d.rows)
  const mainTable = `<table><thead><tr>${DAILY_HEAD.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.rows.map((r, i) => `<tr${sp[i] ? ' class="first"' : ''}>${dailyCells(r).map((c, j) => (MERGED.has(j) ? (sp[i] ? `<td rowspan="${sp[i]}" class="m">${esc(c)}</td>` : '') : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`
  const table = (head: string[], rows: (string | number)[][]) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Report ${esc(periodText(d))}</title>
<style>body{font:13px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#444}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eee}tr{break-inside:avoid}td.m{vertical-align:middle;text-align:center;background:#fafafa;font-weight:600}tr.first td{border-top:2px solid #666}</style>
<h1>Offboarding report: last working day ${esc(periodText(d))}</h1>
<p><b>Leavers:</b> ${d.summary.leavers} · <b>Active:</b> ${d.summary.activeLeavers} · <b>Completed:</b> ${d.summary.completedLeavers} · <b>Actions taken:</b> ${d.summary.actions} · ${d.rows.length} SLA tasks, ${d.completed} completed</p>
${mainTable}
<h1 style="margin-top:24px">Team performance</h1>
${table(TEAM_HEAD, d.teams.map(teamCells))}`)
  w.document.close(); w.focus(); setTimeout(() => w.print(), 250)
  return true
}
