import { useState } from 'react'
import { Button, Card } from '@heroui/react'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { display } from '../lib/fields'
import { commit, useApp } from '../lib/store'
import { can } from '../lib/rbac'
import { log } from '../lib/audit'
import { TaskAction, TaskStatus } from '../ui/TaskMenu'
import type { TaskRow } from '../lib/types'
import { useNav } from '../ui/nav'
import { Confirm, DataTable, Empty, Meter, PageHead, StatusChip, stripe } from '../ui/kit'
import { LeaverForm } from './Leavers'
import { subDate } from './Dashboard'

const delayText = (r: TaskRow) => {
  if (r.delay === null) return ''
  if (r.status === 'Done') return r.delay > 0 ? r.delay + ' d late' : r.delay < 0 ? -r.delay + ' d early' : 'on the day'
  return r.delay + ' d overdue'
}

export default function LeaverDetail({ id }: { id: string }) {
  const s = useApp()
  const { go } = useNav()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const l = E.getLeaver(s, id)
  if (!l) return <PageHead title="Leaver not found" onBack={() => go('leavers')} />

  const sum = E.summary(s, l), n = E.noticeCheck(s, l), missing = E.missingInfo(s, l)
  const reason = s.reasons.find((r) => r.id === l.values.reason)

  return (
    <div>
      <PageHead
        onBack={() => go('leavers')}
        title={l.values.name || '(no name)'}
        sub={`${l.values.dept || ''} · ${reason ? reason.name : 'No reason set'} · ${subDate(s)}`}
        actions={<>
          {can('leavers', 'edit') && <Button variant="secondary" onPress={() => setEditing(true)}>Edit details</Button>}
          {can('leavers', 'edit') && <Button variant="danger-soft" onPress={() => setDeleting(true)}>Delete</Button>}
        </>}
      />
      <Card>
        <Card.Content className="gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-56 flex-1">
              <div className="flex items-center gap-3"><div className="flex-1"><Meter pct={sum.pct} label="Progress" /></div><b className="num">{sum.pct}%</b></div>
              <div className="mt-1 text-sm text-muted">{sum.done} of {sum.base} tasks done{sum.waived ? ` · ${sum.waived} waived` : ''}</div>
            </div>
            <StatusChip text={sum.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
            {s.fields.filter((f) => f.key !== 'name' && f.type !== 'textarea').map((f) => (
              <div key={f.key}><dt className="text-muted">{f.label}</dt><dd>{display(s, f, l.values[f.key])}</dd></div>
            ))}
            <div><dt className="text-muted">Notice check</dt><dd>{n.tone === 'none' ? 'n/a' : <StatusChip text={n.text} />}{n.need && <span className="text-muted"> needs {fmt(n.need)} ({n.months} mo)</span>}</dd></div>
          </dl>
          {missing.length > 0 && <p className="text-sm text-warning"><b>Missing:</b> {missing.join(', ')}</p>}
          {s.fields.filter((f) => f.type === 'textarea' && l.values[f.key]).map((f) => <p key={f.key} className="text-sm text-muted">{f.label}: {l.values[f.key]}</p>)}
        </Card.Content>
      </Card>

      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="text-2xl font-medium">Tasks</h2>
        <span className="text-sm text-muted">{can('leavers', 'action') ? 'Press Take action on a task to update it.' : 'Read-only view'}</span>
      </div>
      {!sum.rows.length ? <Empty>No tasks apply. Set a valid termination reason.</Empty> : (
        <DataTable
          label="Tasks for this leaver"
          cols={[{ key: 's', label: 'Step' }, { key: 'o', label: 'Team' }, { key: 'r', label: 'SLA rule' }, { key: 'd', label: 'Due' }, { key: 'st', label: 'Status' }, { key: 'sl', label: 'SLA result' }, { key: 't', label: 'Timing' }, { key: 'ac', label: 'Action' }]}
          rows={sum.rows.map((r) => {
            const sid = r.step.id
            return {
              id: sid, className: stripe(r.status),
              cells: [
                <span key="s"><span className="text-muted">{sid}</span> {r.step.name}</span>,
                r.step.group,
                <span key="r" className="text-sm text-muted">{E.slaText(s, r.step)}</span>,
                r.due ? fmt(r.due) : r.status === 'Waiting' ? <span key="d" className="text-muted">awaiting start</span> : '—',
                <TaskStatus key="st" row={r} />,
                r.sla ? <StatusChip key="sl" text={r.sla} /> : '',
                delayText(r),
                <TaskAction key="ac" row={r} mod="leavers" />,
              ],
            }
          })}
        />
      )}
      {editing && <LeaverForm leaver={l} onClose={() => setEditing(false)} />}
      <Confirm
        open={deleting} title="Delete this leaver?" text="This removes the record and its task history from this browser."
        onClose={() => setDeleting(false)}
        onOk={() => { log('Leaver deleted', 'The record and its task history were deleted.', l.values.name || l.id); s.leavers = s.leavers.filter((x) => x.id !== l.id); setDeleting(false); go('leavers'); commit() }}
      />
    </div>
  )
}
