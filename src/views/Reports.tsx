import { useMemo, useState } from 'react'
import { Button, Card } from '@heroui/react'
import * as E from '../lib/engine'
import { csv, downloadFile } from '../lib/csv'
import { can } from '../lib/rbac'
import { display } from '../lib/fields'
import { getVersion, useApp } from '../lib/store'
import { useNav } from '../ui/nav'
import { Columns, Donut, LineChart } from '../ui/charts'
import { MON } from '../lib/dates'
import { DataTable, Kpi, PageHead, Pick, SectionTitle, StatusChip, pctText, stripe } from '../ui/kit'
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

  const expTasks = () => {
    const fs = s.fields.filter((f) => f.key !== 'name')
    const out: (string | number | null)[][] = [['Leaver', ...fs.map((f) => f.label), 'Step', 'Task', 'Team', 'Rule', 'Due', 'Completed', 'Status', 'SLA result', 'Days (late +, early -)']]
    rows.forEach((r) => out.push([r.leaver.values.name, ...fs.map((f) => display(s, f, r.leaver.values[f.key]).replace(/^—$/, '')), r.step.id, r.step.name, r.step.group, E.slaText(s, r.step), r.due || '', r.done, r.status, r.sla, r.delay]))
    downloadFile('offboarding-tasks.csv', csv(out))
  }
  const expLeavers = () => {
    const out: (string | number)[][] = [[...s.fields.map((f) => f.label), 'Done', 'Applicable', '% done', 'Overdue', 'Late', 'Notice', 'Status']]
    s.leavers.forEach((l) => { const m = E.summary(s, l); out.push([...s.fields.map((f) => display(s, f, l.values[f.key]).replace(/^—$/, '')), m.done, m.base, m.pct, m.overdue, m.late, E.noticeCheck(s, l).text, m.status]) })
    downloadFile('offboarding-leavers.csv', csv(out))
  }

  const by: Record<string, typeof s.leavers> = {}
  if (gf) s.leavers.forEach((l) => { const k = display(s, gf, l.values[gf.key]); (by[k] ??= []).push(l) })

  return (
    <div>
      <PageHead title="Reports" sub={'Employees, teams and steps measured against their SLA. ' + subDate(s)}
        actions={can('reports', 'action') ? <><Button variant="secondary" onPress={expTasks}>Export tasks CSV</Button><Button variant="secondary" onPress={expLeavers}>Export leavers CSV</Button></> : undefined} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="On time" value={comp.on} tone="success" /><Kpi label="Done late" value={comp.late} tone="warning" /><Kpi label="Breached (open, past due)" value={comp.br} tone="danger" /><Kpi label="Compliance" value={pctText(comp.pct)} tone="accent" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="glass-card rounded-3xl p-5" aria-label="Deadline results">
          <h2 className="mb-4 text-base font-semibold">Deadline results</h2>
          <Donut centre={pctText(comp.pct)} caption="on time"
            slices={[{ label: 'On time', value: comp.on, color: 'var(--success)' }, { label: 'Done late', value: comp.late, color: 'var(--warning)' }, { label: 'Breached', value: comp.br, color: 'var(--danger)' }]} />
        </section>
        <section className="glass-card rounded-3xl p-5" aria-label="Deadlines by team">
          <h2 className="mb-4 text-base font-semibold">Deadlines by team</h2>
          <Columns parts={[{ label: 'On time', color: 'var(--success)' }, { label: 'Late', color: 'var(--warning)' }, { label: 'Breached', color: 'var(--danger)' }]}
            cols={s.groups.map((g) => { const c = E.complianceOf(rows.filter((r) => r.step.group === g)); return { label: g, values: [c.on, c.late, c.br] } })} />
        </section>
        <section className="glass-card rounded-3xl p-5 md:col-span-2 xl:col-span-1" aria-label="Finished each month">
          <h2 className="mb-4 text-base font-semibold">Finished each month</h2>
          <MonthlyChart rows={rows} />
        </section>
      </div>

      <SectionTitle title="Team detail" />
      <DataTable label="Team detail"
        cols={[{ key: 'o', label: 'Team' }, ...['Tasks', 'Done', 'On time', 'Late', 'Breached', 'Avg days late', 'Open', 'Compliance'].map((l) => ({ key: l, label: l, align: 'end' as const }))]}
        rows={s.groups.map((g) => {
          const gr = rows.filter((r) => r.step.group === g), c = E.complianceOf(gr)
          return { id: g, cells: [g, gr.length, gr.filter((r) => r.status === 'Done').length, c.on, c.late, c.br, avgLate(gr), gr.filter(isOpen).length, pctText(c.pct)] }
        })} />

      <SectionTitle title="Step performance" aside="Sorted by problems (late + breached)" />
      <DataTable label="Step performance"
        cols={[{ key: 's', label: 'Step' }, { key: 'o', label: 'Team' }, { key: 'r', label: 'Rule' }, ...['Done', 'On time', 'Late', 'Breached', 'Avg days late'].map((l) => ({ key: l, label: l, align: 'end' as const }))]}
        rows={s.steps.filter((x) => x.active).map((st) => {
          const sr = rows.filter((r) => r.step.id === st.id)
          return { st, n: sr.length, done: sr.filter((r) => r.status === 'Done').length, c: E.complianceOf(sr), avg: avgLate(sr) }
        }).filter((x) => x.n > 0).sort((a, b) => b.c.late + b.c.br - (a.c.late + a.c.br)).map((x) => ({
          id: x.st.id,
          cells: [<span key="s"><span className="text-muted">{x.st.id}</span> {x.st.name}</span>, x.st.group, E.slaText(s, x.st), `${x.done}/${x.n}`, x.c.on, x.c.late, x.c.br, x.avg],
        }))} />

      <SectionTitle title="Employee report" />
      <DataTable label="Employee report"
        cols={[{ key: 'e', label: 'Employee' }, { key: 'r', label: 'Reason' }, { key: 'd', label: 'Done', align: 'end' }, { key: 'on', label: 'On time', align: 'end' }, { key: 'l', label: 'Late', align: 'end' }, { key: 'b', label: 'Breached', align: 'end' }, { key: 'n', label: 'Notice' }, { key: 's', label: 'Status' }]}
        rows={s.leavers.map((l) => {
          const m = E.summary(s, l), c = E.complianceOf(m.rows), n = E.noticeCheck(s, l)
          return {
            id: l.id, className: stripe(m.status), onAction: () => go('leavers', l.id),
            cells: [<b key="e">{l.values.name}</b>, display(s, rf, l.values.reason), `${m.done}/${m.base} (${m.pct}%)`, c.on, c.late, c.br, n.tone === 'none' ? 'n/a' : <StatusChip key="n" text={n.text} />, <StatusChip key="s" text={m.status} />],
          }
        })} />

      <SectionTitle title="Leavers by field" aside={<Pick className="w-56" label="Group leavers by" value={gf?.key ?? ''} onChange={setGroupBy} options={gfields.map((f) => ({ v: f.key, l: f.label }))} />} />
      <Card><Card.Content className="gap-2">
        {Object.keys(by).length === 0 && <p className="text-sm text-muted">No data.</p>}
        {Object.keys(by).sort((a, b) => by[b].length - by[a].length).map((k) => {
          const c = E.complianceOf(by[k].flatMap((l) => E.leaverRows(s, l)))
          return <div key={k} className="flex justify-between"><span>{k}</span><span className="num"><b>{by[k].length}</b> <span className="text-muted">· SLA {pctText(c.pct)}</span></span></div>
        })}
      </Card.Content></Card>
    </div>
  )
}
