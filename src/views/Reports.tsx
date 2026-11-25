import { useMemo, useState } from 'react'
import { Button, Card } from '@heroui/react'
import * as E from '../lib/engine'
import { csv, downloadFile } from '../lib/csv'
import { can, canSeeArchive } from '../lib/rbac'
import { display } from '../lib/fields'
import { getVersion, useApp } from '../lib/store'
import { useNav } from '../ui/nav'
import { Columns, Donut, LineChart } from '../ui/charts'
import { MON, addDays, fmt, localToday } from '../lib/dates'
import { useAudit } from '../lib/audit'
import { DAILY_HEAD, TEAM_HEAD, buildDaily, exportDailyExcel, printDaily, teamCells } from '../lib/dailyReport'
import { DataTable, Kpi, Meter, TextInput, PageHead, Pick, SectionTitle, StatusChip, pctText, stripe } from '../ui/kit'
import { subDate } from './Dashboard'
import type { TaskRow } from '../lib/types'

const avgLate = (rs: TaskRow[]) => {
  const l = rs.filter((r) => r.sla === 'Late')
  return l.length ? (l.reduce((a, r) => a + (r.delay ?? 0), 0) / l.length).toFixed(1) : '—'
}
const isOpen = (r: TaskRow) => !['Done', 'Waived'].includes(r.status)

function MonthlyChart({ rows }: { rows: TaskRow[] }) {
  const done = rows.filter((r) => r.status === 'Done' && r.done)
  const map: Record<string, { on: number; late: number }> = {}
  done.forEach((r) => { const k = r.done.slice(0, 7); map[k] ??= { on: 0, late: 0 }; if (r.sla === 'Late') map[k].late++; else map[k].on++ })
  const keys = Object.keys(map).sort()
  const all: string[] = []
  let cur = keys[0]
  while (keys.length && cur <= keys[keys.length - 1]) { all.push(cur); let y = +cur.slice(0, 4), m = +cur.slice(5, 7) + 1; if (m > 12) { m = 1; y++ } cur = y + '-' + String(m).padStart(2, '0') }
  return <LineChart points={all.slice(-8).map((k) => ({ label: `${MON[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`, values: [map[k]?.on ?? 0, map[k]?.late ?? 0] }))}
    series={[{ label: 'On time', color: 'var(--success)' }, { label: 'Late', color: 'var(--warning)' }]} />
}

export default function Reports() {
  const s = useApp()
  const { go } = useNav()
  const rows = useMemo(() => E.allRows(s), [s, getVersion()])
  const comp = E.complianceOf(rows)
  const gfields = s.fields.filter((f) => ['select', 'reason', 'checkbox', 'text'].includes(f.type) && f.key !== 'name' && f.key !== 'empId')
  const [groupBy, setGroupBy] = useState('reason')
  const gf = E.fieldByKey(s, gfields.some((f) => f.key === groupBy) ? groupBy : gfields[0]?.key ?? '')
  const rf = E.fieldByKey(s, 'reason')

  // Exports include archived leavers (for people allowed to see the archive), marked in their own column.
  const exportable = s.leavers.filter((l) => !E.isArchived(l) || canSeeArchive())
  const expTasks = () => {
    const fs = s.fields.filter((f) => f.key !== 'name')
    const out: (string | number | null)[][] = [['Leaver', ...fs.map((f) => f.label), 'Archived', 'Step', 'Task', 'Team', 'Rule', 'Due', 'Completed', 'Status', 'SLA result', 'Days (late +, early -)']]
    exportable.flatMap((l) => E.leaverRows(s, l)).forEach((r) => out.push([E.who(r.leaver), ...fs.map((f) => display(s, f, r.leaver.values[f.key]).replace(/^—$/, '')), E.isArchived(r.leaver) ? 'Yes' : 'No', r.step.id, r.step.name, r.step.group, E.slaText(s, r.step), r.due || '', r.done, r.status, r.sla, r.delay]))
    downloadFile('offboarding-tasks.csv', csv(out))
  }
  const expLeavers = () => {
    const out: (string | number)[][] = [[...s.fields.map((f) => f.label), 'Done', 'Applicable', '% done', 'Overdue', 'Late', 'Notice', 'Status', 'Archived']]
    exportable.forEach((l) => { const m = E.summary(s, l); out.push([...s.fields.map((f) => display(s, f, l.values[f.key]).replace(/^—$/, '')), m.done, m.base, m.pct, m.overdue, m.late, E.noticeCheck(s, l).text, m.status, E.isArchived(l) ? 'Yes' : 'No']) })
    downloadFile('offboarding-leavers.csv', csv(out))
  }

  const [tab, setTab] = useState<'period' | 'performance' | 'employees'>('performance')
  const [from, setFrom] = useState(localToday()), [to, setTo] = useState(localToday())
  const audit = useAudit().entries
  const daily = useMemo(() => buildDaily(s, from, to), [s, from, to, getVersion(), audit])

  const by: Record<string, typeof s.leavers> = {}
  if (gf) E.liveLeavers(s).forEach((l) => { const k = display(s, gf, l.values[gf.key]); (by[k] ??= []).push(l) })

  const today = localToday()
  const dow = new Date(today + 'T00:00:00').getDay()                  // 0 = Sunday
  const monthStart = today.slice(0, 8) + '01'
  const monthEnd = (() => { const d = new Date(today.slice(0, 4) + '-' + today.slice(5, 7) + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const presets: { label: string; a: string; b: string }[] = [
    { label: 'Today', a: today, b: today },
    { label: 'This week', a: addDays(today, -dow), b: addDays(today, 6 - dow) },
    { label: 'Next 7 days', a: today, b: addDays(today, 6) },
    { label: 'This month', a: monthStart, b: monthEnd },
    { label: 'Last 30 days', a: addDays(today, -29), b: today },
  ]
  const pctDone = daily.rows.length ? Math.round((daily.completed / daily.rows.length) * 100) : 0
  const canExport = can('reports', 'action')

  return (
    <div>
      <PageHead title="Reports" sub={'Employees, teams and steps measured against their SLA. ' + subDate(s)}
        actions={!canExport ? undefined : tab === 'period'
          ? <><Button variant="secondary" isDisabled={!daily.rows.length} onPress={() => void exportDailyExcel(daily)}>Export Excel</Button><Button isDisabled={!daily.rows.length} onPress={() => { if (!printDaily(daily)) alert('Allow pop-ups to print the report.') }}>Print</Button></>
          : <><Button variant="secondary" onPress={expTasks}>Export tasks CSV</Button><Button variant="secondary" onPress={expLeavers}>Export leavers CSV</Button></>} />

      <div role="tablist" aria-label="Report sections" className="panel mb-5 inline-flex rounded-2xl p-1">
        {([['performance', 'Performance'], ['period', 'Period Report'], ['employees', 'Employees']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${tab === id ? 'bg-accent text-accent-foreground shadow' : 'text-muted hover:bg-foreground/5 hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === 'period' && (
        <div className="grid gap-5">
          <section className="glass-card rounded-3xl p-5" aria-label="Choose the period">
            <h2 className="text-base font-semibold">Last Working Day Period</h2>
            <p className="mt-1 text-sm text-muted">Shows every leaver whose last working day falls between the two dates, with each of their SLA tasks.</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-44"><TextInput label="From" type="date" value={from} onChange={(v) => v && setFrom(v)} /></div>
              <div className="w-44"><TextInput label="To" type="date" value={to} onChange={(v) => v && setTo(v)} /></div>
              <div className="flex flex-wrap gap-2 pb-0.5">
                {presets.map((p) => {
                  const on = daily.from === p.a && daily.to === p.b
                  return <button key={p.label} type="button" aria-pressed={on} onClick={() => { setFrom(p.a); setTo(p.b) }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-accent bg-accent/15 text-accent' : 'border-separator text-muted hover:border-accent/60 hover:text-foreground'}`}>{p.label}</button>
                })}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Leavers in period" value={daily.summary.leavers} />
            <Kpi label="Active leavers" value={daily.summary.activeLeavers} tone="accent" />
            <Kpi label="Completed leavers" value={daily.summary.completedLeavers} tone="success" />
            <Kpi label="Actions taken" value={daily.summary.actions} />
          </div>

          {!daily.rows.length ? (
            <div className="panel rounded-3xl p-8 text-center">
              <p className="font-semibold">No leaver has a last working day in this period</p>
              <p className="mt-1 text-sm text-muted">Try a wider period, for example “This month”.</p>
            </div>
          ) : (
            <>
              <section className="glass-card rounded-3xl p-5" aria-label="SLA tasks">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">SLA Tasks by Employee</h2>
                  <p className="text-sm"><b>{daily.rows.length}</b> tasks · <b className="text-success">{daily.completed}</b> completed · <b>{daily.notCompleted}</b> not completed</p>
                </div>
                <div className="mb-4"><Meter pct={pctDone} label="Tasks completed in this period" /></div>
                <DataTable label="SLA tasks by employee" cols={DAILY_HEAD.map((h, i) => ({ key: String(i), label: h }))}
                  rows={daily.rows.slice(0, 100).map((r, i) => ({
                    id: String(i),
                    cells: [<b key="i" className="num">{r.empId}</b>, r.name || <span key="n" className="text-muted">—</span>,
                      r.email ? <span key="e" className="break-all">{r.email}</span> : <span key="e" className="text-muted">—</span>,
                      fmt(r.lwd), r.sla, r.team,
                      <StatusChip key="c" text={r.completed === 'Yes' ? 'Done' : 'Open'} />,
                      <div key="p" className="flex min-w-24 items-center gap-2"><div className="flex-1"><Meter pct={r.progress} label="Progress" /></div><span className="num text-xs text-muted">{r.progress}%</span></div>,
                      <span key="a" className={r.archived === 'Yes' ? 'font-semibold' : 'text-muted'}>{r.archived}</span>,
                      r.note ? <span key="t" className="text-sm">{r.note}</span> : <span key="t" className="text-muted">—</span>],
                  }))} />
                {daily.rows.length > 100 && <p className="mt-2 text-sm text-muted">Showing 100 of {daily.rows.length} rows. The export has all of them.</p>}
              </section>

              <section className="glass-card rounded-3xl p-5" aria-label="Team performance">
                <h2 className="mb-1 text-base font-semibold">Team Performance</h2>
                <p className="mb-3 text-sm text-muted">SLA results and repeated blocks per team, for the leavers above.</p>
                <DataTable label="Team performance" cols={TEAM_HEAD.map((h, i) => ({ key: String(i), label: h, align: i === 0 ? undefined : ('end' as const) }))}
                  rows={daily.teams.map((t) => ({
                    id: t.team,
                    cells: teamCells(t).map((c, j) => j === 0 ? <b key={j}>{c}</b>
                      : j === 5 ? <span key={j} className={`font-semibold ${t.onTimePct === null ? 'text-muted' : t.onTimePct >= 80 ? 'text-success' : t.onTimePct >= 50 ? 'text-warning' : 'text-danger'}`}>{c}</span>
                      : j === 9 && Number(c) > 0 ? <span key={j} className="rounded-full bg-danger/15 px-2 py-0.5 font-semibold text-danger">{c}</span>
                      : j === 6 && Number(c) > 0 ? <span key={j} className="font-semibold text-danger">{c}</span>
                      : j === 7 && Number(c) > 0 ? <span key={j} className="font-semibold text-warning">{c}</span> : c),
                  }))} />
              </section>
            </>
          )}
        </div>
      )}

      {tab === 'performance' && (
        <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="On time" value={comp.on} tone="success" /><Kpi label="Done late" value={comp.late} tone="warning" /><Kpi label="Breached (open, past due)" value={comp.br} tone="danger" /><Kpi label="Compliance" value={pctText(comp.pct)} tone="accent" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="glass-card rounded-3xl p-5" aria-label="Deadline results">
          <h2 className="mb-4 text-base font-semibold">Deadline Results</h2>
          <Donut centre={pctText(comp.pct)} caption="on time"
            slices={[{ label: 'On time', value: comp.on, color: 'var(--success)' }, { label: 'Done late', value: comp.late, color: 'var(--warning)' }, { label: 'Breached', value: comp.br, color: 'var(--danger)' }]} />
        </section>
        <section className="glass-card rounded-3xl p-5" aria-label="On-time results by team">
          <h2 className="mb-4 text-base font-semibold">On-Time Results by Team</h2>
          <Columns parts={[{ label: 'On time', color: 'var(--success)' }, { label: 'Late', color: 'var(--warning)' }, { label: 'Breached', color: 'var(--danger)' }]}
            cols={s.groups.map((g) => { const c = E.complianceOf(rows.filter((r) => r.step.group === g)); return { label: g, values: [c.on, c.late, c.br] } })} />
        </section>
        <section className="glass-card rounded-3xl p-5 md:col-span-2 xl:col-span-1" aria-label="Finished each month">
          <h2 className="mb-4 text-base font-semibold">Finished Each Month</h2>
          <MonthlyChart rows={rows} />
        </section>
      </div>

      <SectionTitle title="Team Detail" />
      <DataTable label="Team detail"
        cols={[{ key: 'o', label: 'Team' }, ...['Tasks', 'Done', 'On time', 'Late', 'Breached', 'Avg days late', 'Open', 'Compliance'].map((l) => ({ key: l, label: l, align: 'end' as const }))]}
        rows={s.groups.map((g) => {
          const gr = rows.filter((r) => r.step.group === g), c = E.complianceOf(gr)
          return { id: g, cells: [g, gr.length, gr.filter((r) => r.status === 'Done').length, c.on, c.late, c.br, avgLate(gr), gr.filter(isOpen).length, pctText(c.pct)] }
        })} />

      <SectionTitle title="Step Performance" aside="Sorted by problems (late + breached)" />
      <DataTable label="Step performance"
        cols={[{ key: 's', label: 'Step' }, { key: 'o', label: 'Team' }, { key: 'r', label: 'Rule' }, ...['Done', 'On time', 'Late', 'Breached', 'Avg days late'].map((l) => ({ key: l, label: l, align: 'end' as const }))]}
        rows={[...new Map(rows.map((r) => [r.step.id, r.step])).values()].map((st) => {
          const sr = rows.filter((r) => r.step.id === st.id)
          return { st, n: sr.length, done: sr.filter((r) => r.status === 'Done').length, c: E.complianceOf(sr), avg: avgLate(sr) }
        }).filter((x) => x.n > 0).sort((a, b) => b.c.late + b.c.br - (a.c.late + a.c.br)).map((x) => ({
          id: x.st.id,
          cells: [<span key="s"><span className="text-muted">{x.st.id}</span> {x.st.name}{s.steps.find((y) => y.id === x.st.id)?.active === false ? <span className="ml-2 rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-muted">switched off</span> : null}</span>, x.st.group, E.slaText(s, x.st), `${x.done}/${x.n}`, x.c.on, x.c.late, x.c.br, x.avg],
        }))} />

        </div>
      )}

      {tab === 'employees' && (
        <div>
      <SectionTitle title="Employee Report" />
      <DataTable label="Employee report"
        cols={[{ key: 'e', label: 'Employee' }, { key: 'r', label: 'Reason' }, { key: 'd', label: 'Done', align: 'end' }, { key: 'on', label: 'On time', align: 'end' }, { key: 'l', label: 'Late', align: 'end' }, { key: 'b', label: 'Breached', align: 'end' }, { key: 'n', label: 'Notice' }, { key: 's', label: 'Status' }]}
        rows={E.liveLeavers(s).map((l) => {
          const m = E.summary(s, l), c = E.complianceOf(m.rows), n = E.noticeCheck(s, l)
          return {
            id: l.id, className: stripe(m.status), onAction: () => go('leavers', l.id),
            cells: [<b key="e">{E.who(l)}</b>, display(s, rf, l.values.reason), `${m.done}/${m.base} (${m.pct}%)`, c.on, c.late, c.br, n.tone === 'none' ? 'n/a' : <StatusChip key="n" text={n.text} />, <StatusChip key="s" text={m.status} />],
          }
        })} />

      <SectionTitle title="Leavers by Field" aside={<Pick className="w-56" label="Group leavers by" value={gf?.key ?? ''} onChange={setGroupBy} options={gfields.map((f) => ({ v: f.key, l: f.label }))} />} />
      <Card><Card.Content className="gap-2">
        {Object.keys(by).length === 0 && <p className="text-sm text-muted">No data.</p>}
        {Object.keys(by).sort((a, b) => by[b].length - by[a].length).map((k) => {
          const c = E.complianceOf(by[k].flatMap((l) => E.leaverRows(s, l)))
          return <div key={k} className="flex justify-between"><span>{k}</span><span className="num"><b>{by[k].length}</b> <span className="text-muted">· SLA {pctText(c.pct)}</span></span></div>
        })}
      </Card.Content></Card>
        </div>
      )}
    </div>
  )
}
