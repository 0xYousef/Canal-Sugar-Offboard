import { useMemo, useState } from 'react'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { getVersion, useApp } from '../lib/store'
import { TaskAction, TaskStatus } from '../ui/TaskMenu'
import { useNav } from '../ui/nav'
import { DataTable, Empty, NameBtn, PageHead, Pick, TextInput, stripe } from '../ui/kit'
import { subDate } from './Dashboard'

const STATUSES = [['open', 'All open'], ['Overdue', 'Overdue'], ['Due Soon', 'Due soon'], ['Blocked', 'Blocked'], ['Waiting', 'Waiting for a date'], ['all', 'Everything']]
const ORDER: Record<string, number> = { Overdue: 0, Blocked: 1, 'Due Soon': 2, Pending: 3, Open: 4, Waiting: 5, Done: 6, Waived: 7 }

export default function Tasks() {
  const s = useApp()
  const { go } = useNav()
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState('open')
  const [q, setQ] = useState('')

  const all = useMemo(() => E.allRows(s), [s, getVersion()])
  const rows = all.filter((r) => {
    if (owner && r.step.group !== owner) return false
    if (status === 'open') { if (['Done', 'Waived'].includes(r.status)) return false }
    else if (status !== 'all' && r.status !== status) return false
    const t = q.toLowerCase()
    return !t || (r.leaver.values.name + ' ' + r.step.name + ' ' + r.step.id).toLowerCase().includes(t)
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || ((a.due || '9') < (b.due || '9') ? -1 : 1))
  const shown = rows.slice(0, 250)

  return (
    <div>
      <PageHead title="Tasks" sub={'Every open step across all leavers. Press Take action on a task to finish or change it. ' + subDate(s)} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Pick label="Team" value={owner || '__all'} onChange={(v) => setOwner(v === '__all' ? '' : v)} options={[{ v: '__all', l: 'All teams' }, ...s.groups.map((g) => ({ v: g, l: g }))]} />
        <Pick label="Status" value={status} onChange={setStatus} options={STATUSES.map(([v, l]) => ({ v, l }))} />
        <TextInput label="Search" type="search" value={q} onChange={setQ} placeholder="Leaver or task" />
      </div>
      {!rows.length ? <Empty>No tasks match.</Empty> : (
        <>
          <DataTable
            label="Tasks"
            cols={[{ key: 'l', label: 'Leaver' }, { key: 's', label: 'Step' }, { key: 'o', label: 'Team' }, { key: 'd', label: 'Due' }, { key: 'st', label: 'Status' }, { key: 'ac', label: 'Action' }]}
            rows={shown.map((r) => ({
              id: r.leaver.id + r.step.id,
              className: stripe(r.status),
              cells: [
                <NameBtn key="l" onPress={() => go('leavers', r.leaver.id)}>{r.leaver.values.name}</NameBtn>,
                <span key="s"><span className="text-muted">{r.step.id}</span> {r.step.name}</span>,
                r.step.group,
                <span key="d" className="whitespace-nowrap">{r.due ? fmt(r.due) : '—'}{r.delay && r.status !== 'Done' ? <span className="text-muted"> ({r.delay} d)</span> : null}</span>,
                <TaskStatus key="st" row={r} />,
                <TaskAction key="ac" row={r} />,
              ],
            }))}
          />
          {rows.length > shown.length && <p className="mt-2 text-sm text-muted">Showing {shown.length} of {rows.length}. Narrow the filters to see the rest.</p>}
        </>
      )}
    </div>
  )
}
