import { Button, Card } from '@heroui/react'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { currentUser } from '../lib/auth'
import { useMemo, useState } from 'react'
import { getVersion, useApp } from '../lib/store'
import { canAct } from '../lib/rbac'
import { DoneDialog } from '../ui/TaskMenu'
import type { TaskRow } from '../lib/types'
import { useNav } from '../ui/nav'
import { DataTable, Empty, Kpi, Meter, NameBtn, PageHead, SeeAll, SectionTitle, StatusChip, pctText } from '../ui/kit'

export const subDate = (s: Parameters<typeof E.today>[0]) =>
  'Report date ' + fmt(E.today(s)) + (s.settings.reportDate ? ' (override)' : ' (today)')

export default function Dashboard() {
  const s = useApp()
  const { go } = useNav()
  const v = getVersion()
  const rows = useMemo(() => E.allRows(s), [s, v])
  const leavers = useMemo(() => E.liveLeavers(s), [s, v])
  const sums = useMemo(() => leavers.map((l) => E.summary(s, l)), [s, v, leavers])
  const open = (r: (typeof rows)[number]) => !['Done', 'Waived'].includes(r.status)
  const count = (st: string) => rows.filter((r) => r.status === st).length
  const comp = E.complianceOf(rows)
  const missing = leavers.filter((l) => E.missingInfo(s, l).length)
  const overdue = rows.filter((r) => r.status === 'Overdue').sort((a, b) => (b.delay ?? 0) - (a.delay ?? 0)).slice(0, 10)

  const [doing, setDoing] = useState<TaskRow | null>(null)
  const h = new Date().getHours()
  const first = (currentUser()?.name ?? '').split(' ')[0]
  const mine = rows.filter((r) => ['Overdue', 'Blocked', 'Due Soon'].includes(r.status) && canAct('dashboard', r.step.group))
    .sort((a, b) => (b.delay ?? 0) - (a.delay ?? 0)).slice(0, 5)
  const hello = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + first : '')

  return (
    <div>
      <PageHead title={hello} sub={subDate(s) + '. Updates the moment a task is saved.'} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Active leavers" value={sums.filter((x) => x.status !== 'Completed').length} tone="accent" />
        <Kpi label="Open tasks" value={rows.filter(open).length} tone="accent" />
        <Kpi label="Due soon" value={count('Due Soon')} tone="warning" />
        <Kpi label="Overdue now" value={count('Overdue')} tone="danger" />
        <Kpi label="SLA compliance" value={pctText(comp.pct)} tone="success" />
      </div>

      <SectionTitle title="Needs Your Attention" aside={mine.length ? `${mine.length} you can act on now` : undefined} />
      {!mine.length ? <Empty>You are all caught up. Nothing you own is overdue or due soon.</Empty> : (
        <div className="grid gap-2">
          {mine.map((r) => (
            <div key={r.leaver.id + r.step.id} className={`panel flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 ${r.status === 'Overdue' ? 'stripe-crit' : r.status === 'Blocked' ? 'stripe-block' : 'stripe-warn'}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.step.name}</div>
                <div className="text-sm text-muted">
                  <NameBtn onPress={() => go('leavers', r.leaver.id)}>{E.who(r.leaver)}</NameBtn>
                  {' · '}{r.step.group}{r.due ? ` · due ${fmt(r.due)}` : ''}{r.delay ? ` · ${r.delay} working d late` : ''}
                </div>
              </div>
              <StatusChip text={r.status} />
              <Button size="sm" onPress={() => setDoing(r)}>Done</Button>
            </div>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <Card className="mt-4 border-l-4 border-warning">
          <Card.Content className="text-sm">
            <b>Missing information: </b>
            {missing.map((l, i) => (
              <span key={l.id}>
                {i > 0 && ' · '}
                <NameBtn onPress={() => go('leavers', l.id)}>{E.who(l)}</NameBtn>
                {' '}({E.missingInfo(s, l).join(', ')})
              </span>
            ))}
          </Card.Content>
        </Card>
      )}

      <div className="defer"><SectionTitle title="By Team" aside="Open = applicable tasks not done or waived" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {s.groups.map((g) => {
          const gr = rows.filter((r) => r.step.group === g)
          const gv = gr.filter((r) => r.status === 'Overdue').length
          const c = E.complianceOf(gr)
          return (
            <Card key={g}>
              <Card.Header className="flex-row items-center justify-between">
                <Card.Title className="text-base">{g}</Card.Title>
                <StatusChip text={gv ? `${gv} overdue` : 'clear'} />
              </Card.Header>
              <Card.Content>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                  <dt className="text-muted">Open</dt><dd className="num text-right">{gr.filter(open).length}</dd>
                  <dt className="text-muted">Due soon</dt><dd className="num text-right">{gr.filter((r) => r.status === 'Due Soon').length}</dd>
                  <dt className="text-muted">Overdue</dt><dd className="num text-right">{gv}</dd>
                  <dt className="text-muted">SLA compliance</dt><dd className="num text-right">{pctText(c.pct)}</dd>
                </dl>
              </Card.Content>
            </Card>
          )
        })}
      </div>

      </div>
      <SectionTitle title="Most Overdue" aside={<SeeAll label="All tasks" onPress={() => go('tasks')} />} />
      {!overdue.length ? <Empty>Nothing is overdue.</Empty> : (
        <DataTable
          label="Most overdue tasks"
          cols={[{ key: 'l', label: 'Leaver' }, { key: 't', label: 'Task' }, { key: 'o', label: 'Team' }, { key: 'd', label: 'Due' }, { key: 'x', label: 'Overdue', align: 'end' }]}
          rows={overdue.map((r) => ({
            id: r.leaver.id + r.step.id,
            onAction: () => go('leavers', r.leaver.id),
            cells: [E.who(r.leaver), <span key="t"><span className="text-muted">{r.step.id}</span> {r.step.name}</span>, r.step.group, fmt(r.due), r.delay + ' d'],
          }))}
        />
      )}

      <SectionTitle title="Leaver Progress" aside={<SeeAll label="All leavers" onPress={() => go('leavers')} />} />
      <Card>
        <Card.Content className="grid gap-4">
          {!leavers.length && <Empty>No leavers yet.</Empty>}
          {leavers.map((l, i) => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:flex-nowrap">
              <NameBtn className="min-w-44" onPress={() => go('leavers', l.id)}>{E.who(l)}</NameBtn>
              <div className="min-w-32 flex-1"><Meter pct={sums[i].pct} label={`${E.who(l)} progress`} /></div>
              <span className="num w-24 text-right text-sm">{sums[i].done}/{sums[i].base} · {sums[i].pct}%</span>
              <StatusChip text={sums[i].status} />
            </div>
          ))}
        </Card.Content>
      </Card>
      {doing && <DoneDialog mod="dashboard" row={doing} onClose={() => setDoing(null)} />}
    </div>
  )
}
