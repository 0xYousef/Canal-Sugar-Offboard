import { useMemo, useState } from 'react'
import { Button, toast } from '@heroui/react'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { getVersion, state, useApp } from '../lib/store'
import { localToday } from '../lib/dates'
import { canAct } from '../lib/rbac'
import { missingAnswers, recordFor, setTasks, type Answers } from '../lib/tasks'
import { asksAnything, flowOf } from '../lib/workflow'
import { REOPEN } from '../lib/flowDefaults'
import type { WorkflowAction } from '../lib/types'
import { TaskAction, TaskStatus, WorkflowFields } from '../ui/TaskMenu'
import { useNav } from '../ui/nav'
import { Check, DataTable, Dialog, Empty, NameBtn, PageHead, Pager, Pick, TextInput, stripe, usePaged } from '../ui/kit'
import { subDate } from './Dashboard'

const STATUSES = [['open', 'All open'], ['Overdue', 'Overdue'], ['Due Soon', 'Due soon'], ['Blocked', 'Blocked'], ['Waiting', 'Waiting for a date'], ['all', 'Everything']]
const ORDER: Record<string, number> = { Overdue: 0, Blocked: 1, 'Due Soon': 2, Pending: 3, Open: 4, Waiting: 5, Done: 6, Waived: 7 }

export default function Tasks() {
  const s = useApp()
  const { go } = useNav()
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState('open')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<WorkflowAction | null>(null)
  const [ans, setAns] = useState<Answers>({ date: localToday(), by: '', note: '' })

  const all = useMemo(() => E.allRows(s), [s, getVersion()])
  const rows = all.filter((r) => {
    if (owner && r.step.group !== owner) return false
    if (status === 'open') { if (['Done', 'Waived'].includes(r.status)) return false }
    else if (status !== 'all' && r.status !== status) return false
    const t = q.toLowerCase()
    return !t || ((r.leaver.values.name ?? '') + ' ' + (r.leaver.values.empId ?? '') + ' ' + r.step.name + ' ' + r.step.id).toLowerCase().includes(t)
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || ((a.due || '9') < (b.due || '9') ? -1 : 1))
  const pg = usePaged(rows, `${owner}|${status}|${q}`)
  const shown = pg.rows
  const key = (r: (typeof rows)[number]) => r.leaver.id + '|' + r.step.id
  const picked = rows.filter((r) => sel.has(key(r)) && canAct('tasks', r.step.group))
  const selectable = shown.filter((r) => canAct('tasks', r.step.group))
  const teams = [...new Set(picked.map((r) => r.step.group))]
  const allOn = selectable.length > 0 && selectable.every((r) => sel.has(key(r)))
  const toggle = (k: string, on: boolean) => setSel((p) => { const n = new Set(p); if (on) n.add(k); else n.delete(k); return n })
  const toggleAll = (on: boolean) => setSel((p) => { const n = new Set(p); selectable.forEach((r) => (on ? n.add(key(r)) : n.delete(key(r)))); return n })
  const W = bulk
  const startBulk = (w: WorkflowAction) => { setAns({ date: localToday(), by: '', note: '' }); setBulk(w) }
  const runBulk = () => {
    if (!bulk || !W) return
    const n = setTasks(picked.map((r) => ({ leaverId: r.leaver.id, stepId: r.step.id })), recordFor(W, ans, localToday()), state, 'tasks', { note: ans.note.trim(), via: W })
    toast.success(`${n} task${n === 1 ? '' : 's'} updated`)
    setBulk(null); setSel(new Set())
  }

  return (
    <div>
      <PageHead title="Tasks" sub={'Every open step across all leavers. Press Take action on a task to finish or change it. ' + subDate(s)} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Pick label="Team" value={owner || '__all'} onChange={(v) => setOwner(v === '__all' ? '' : v)} options={[{ v: '__all', l: 'All teams' }, ...s.groups.map((g) => ({ v: g, l: g }))]} />
        <Pick label="Status" value={status} onChange={setStatus} options={STATUSES.map(([v, l]) => ({ v, l }))} />
        <TextInput label="Search" type="search" value={q} onChange={setQ} placeholder="Name, Employee ID or task" />
      </div>
      {picked.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-accent/10 p-3" role="region" aria-label="Bulk actions">
          <b className="mr-2 text-sm">{picked.length} selected</b>
          {flowOf(state).map((w) => <Button key={w.id} size="sm" onPress={() => startBulk(w)}>{w.label}{asksAnything(w) ? '…' : ''}</Button>)}
          <Button size="sm" variant="secondary" onPress={() => startBulk(REOPEN)}>Reopen</Button>
          <Button size="sm" variant="tertiary" onPress={() => setSel(new Set())}>Clear</Button>
        </div>
      )}
      <Dialog open={!!bulk} onClose={() => setBulk(null)} title={bulk && W ? `${W.label}: ${picked.length} task${picked.length === 1 ? '' : 's'}` : ''}
        footer={<><Button variant="tertiary" onPress={() => setBulk(null)}>Cancel</Button><Button isDisabled={!!W && missingAnswers(W, ans)} onPress={runBulk}>Confirm</Button></>}>
        <p className="mb-3 text-sm">This changes <b>{picked.length}</b> task{picked.length === 1 ? '' : 's'} across <b>{new Set(picked.map((r) => r.leaver.id)).size}</b> leaver{new Set(picked.map((r) => r.leaver.id)).size === 1 ? '' : 's'}, including ones already finished.</p>
        {bulk && W && <WorkflowFields w={W} team={teams.length === 1 ? teams[0] : null} a={ans} set={(p) => setAns((x) => ({ ...x, ...p }))} />}
      </Dialog>
      {!rows.length ? <Empty>No tasks match.</Empty> : (
        <>
          <DataTable
            label="Tasks"
            cols={[{ key: 'sel', label: <Check bare label="Select all" checked={allOn} onChange={toggleAll} /> }, { key: 'l', label: 'Leaver' }, { key: 's', label: 'Step' }, { key: 'o', label: 'Team' }, { key: 'd', label: 'Due' }, { key: 'st', label: 'Status' }, { key: 'ac', label: 'Action' }]}
            rows={shown.map((r) => ({
              id: r.leaver.id + r.step.id,
              className: stripe(r.status),
              cells: [
                canAct('tasks', r.step.group) ? <Check key="c" bare label={`Select ${r.step.id} for ${E.who(r.leaver)}`} checked={sel.has(key(r))} onChange={(v) => toggle(key(r), v)} /> : <span key="c" className="text-muted">&mdash;</span>,
                <NameBtn key="l" onPress={() => go('leavers', r.leaver.id)}>{E.who(r.leaver)}</NameBtn>,
                <span key="s"><span className="text-muted">{r.step.id}</span> {r.step.name}</span>,
                r.step.group,
                <span key="d" className="whitespace-nowrap">{r.due ? fmt(r.due) : '—'}{r.delay && r.status !== 'Done' ? <span className="text-muted" title="Working days late"> ({r.delay} wd)</span> : null}</span>,
                <TaskStatus key="st" row={r} />,
                <TaskAction key="ac" row={r} />,
              ],
            }))}
          />
          <Pager {...pg} />
        </>
      )}
    </div>
  )
}
