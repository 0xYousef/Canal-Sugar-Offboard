import { useState } from 'react'
import { Button, Card } from '@heroui/react'
import { setRuleActive } from '../lib/tasks'
import { refreshSnapshot } from '../lib/snapshot'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { display } from '../lib/fields'
import { commit, session, useApp } from '../lib/store'
import { can, canSeeArchive, hasExtra, isOwner } from '../lib/rbac'
import { log } from '../lib/audit'
import { TaskAction, TaskStatus } from '../ui/TaskMenu'
import type { TaskRow } from '../lib/types'
import { useNav } from '../ui/nav'
import { Confirm, DataTable, Dialog, Empty, Meter, PageHead, StatusChip, TextInput, Toggle, stripe } from '../ui/kit'
import { LeaverForm } from './Leavers'
import { subDate } from './Dashboard'

const delayText = (r: TaskRow) => {
  if (r.delay === null) return ''
  // Counted in working days: weekends and holidays never add to it.
  const wd = (n: number) => n + ' working day' + (n === 1 ? '' : 's')
  if (r.status === 'Done') return r.delay > 0 ? wd(r.delay) + ' late' : r.delay < 0 ? wd(-r.delay) + ' early' : 'on the day'
  return wd(r.delay) + ' overdue'
}

export default function LeaverDetail({ id }: { id: string }) {
  const s = useApp()
  const { go } = useNav()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [rules, setRules] = useState(false)
  const [ruleQ, setRuleQ] = useState('')
  const [refresh, setRefresh] = useState(false)
  const [offAsk, setOffAsk] = useState<string | null>(null)
  const l = E.getLeaver(s, id)
  // An archived leaver does not exist for anyone the Owner has not allowed.
  if (!l || (E.isArchived(l) && !canSeeArchive())) return <PageHead title="Leaver not found" onBack={() => go('leavers')} />
  const archived = E.isArchived(l)

  const sum = E.summary(s, l), n = E.noticeCheck(s, l), missing = E.missingInfo(s, l)
  const reason = s.reasons.find((r) => r.id === l.values.reason)

  return (
    <div>
      <PageHead
        onBack={() => go('leavers')}
        title={l.values.name || '(no name)'}
        sub={`${l.values.dept || ''} · ${reason ? reason.name : 'No reason set'} · ${subDate(s)}`}
        actions={<>
          {can('leavers', 'edit') && !archived && <Button variant="secondary" onPress={() => setEditing(true)}>Edit details</Button>}
          {archived
            ? hasExtra('restore') && <Button variant="secondary" onPress={() => { delete l.values[E.ARCHIVED]; delete l.values[E.ARCHIVED + 'By']; l.values[E.KEEP] = '1'; log('Leaver restored', 'The leaver was taken out of the archive.', l.values.name || l.id); commit() }}>Restore</Button>
            : isOwner() && <Button variant="danger-soft" onPress={() => setDeleting(true)}>Archive</Button>}
        </>}
      />
      {archived && <p role="status" className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm"><b>Archived.</b> This leaver is hidden from everyone except people the Owner has allowed. {hasExtra('restore') ? 'Press Restore to bring them back.' : 'Only the Owner, or a role allowed to restore, can bring them back.'}</p>}
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
        <span className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {can('leavers', 'action') ? 'Press Take action on a task to update it.' : 'Read-only view'}
          {can('leavers', 'edit') && <Button size="sm" variant="secondary" onPress={() => setRules(true)}>SLA rules for this leaver</Button>}
        </span>
      </div>
      {!sum.rows.length ? <Empty>No rules are switched on for this leaver. Use "SLA rules for this leaver" to switch some on.</Empty> : (
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
      <Dialog open={rules} onClose={() => { setRules(false); setRuleQ('') }} wide title="SLA rules for this leaver"
        footer={<Button onPress={() => { setRules(false); setRuleQ('') }}>Done</Button>}>
        {(() => {
          const state = E.stepsOf(s, l).map((st) => ({ st, globallyOff: !st.active, on: st.active && l.tasks[st.id]?.s !== 'off', closed: ['done', 'waived'].includes(l.tasks[st.id]?.s ?? '') }))
          const onCount = state.filter((x) => x.on).length
          const q = ruleQ.trim().toLowerCase()
          const shown = state.filter((x) => !q || (x.st.id + ' ' + x.st.name + ' ' + x.st.group).toLowerCase().includes(q))
          const switchable = state.filter((x) => !x.globallyOff && !x.on).length
          return (
            <div className="grid min-w-0 gap-4">
              <p className="text-sm text-muted">These are the rules as they were when <b className="text-foreground">{l.values.name || 'this leaver'}</b> was created. Later changes in Settings do not reach this leaver. Switch a rule off to leave it out for them only.</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 basis-56"><TextInput label="Search rules" type="search" value={ruleQ} onChange={setRuleQ} placeholder="ID, task or team" /></div>
                <p className="pb-2 text-sm"><b>{onCount}</b> of {state.length} on</p>
                <Button size="sm" variant="tertiary" onPress={() => setRefresh(true)}>Use the current rules</Button>
                <Button size="sm" variant="secondary" isDisabled={!switchable} onPress={() => state.forEach((x) => { if (!x.globallyOff && !x.on) setRuleActive(l.id, x.st.id, true, s) })}>Switch all on</Button>
              </div>
              {!shown.length ? <p className="rounded-2xl bg-foreground/5 p-4 text-sm text-muted">No rule matches.</p> : (
                <ul className="grid grid-cols-1 gap-2">
                  {shown.map(({ st, globallyOff, on, closed }) => (
                    <li key={st.id} className="panel flex min-w-0 items-center gap-3 rounded-2xl p-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-snug"><code className="mr-1.5 text-xs text-muted">{st.id}</code>{st.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{st.group}{globallyOff ? ' · off when this leaver was created' : closed ? ' · finished, stays in the reports' : ''}</p>
                      </div>
                      <div className="shrink-0">
                        <Toggle on={on} disabled={globallyOff || closed} label={`${st.id} for ${l.values.name || 'this leaver'}`}
                          onChange={(v) => { if (v) setRuleActive(l.id, st.id, true, s); else if (l.tasks[st.id]) setOffAsk(st.id); else setRuleActive(l.id, st.id, false, s) }}>
                          <span className="w-7 text-sm text-muted">{on ? 'On' : 'Off'}</span>
                        </Toggle>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })()}
      </Dialog>
      <Confirm open={refresh} title="Use the current rules for this leaver?" text="This leaver switches to the rules and actions saved in Settings now. Progress on rules that no longer exist is hidden, and rules you switched off for them stay off. This cannot be undone." onClose={() => setRefresh(false)}
        onOk={() => { refreshSnapshot(s, l); log('Rules updated', 'This leaver now uses the current SLA rules.', l.values.name || l.id); setRefresh(false); commit() }} />
      <Confirm open={!!offAsk} title="Switch this rule off?" text="This leaver already has progress recorded on it. Switching it off clears that progress for them." onClose={() => setOffAsk(null)}
        onOk={() => { if (offAsk) setRuleActive(l.id, offAsk, false, s); setOffAsk(null) }} />
      <Confirm
        open={deleting} title="Archive this leaver?" text="The leaver and their task history are kept, but hidden from the lists, tasks, dashboard and reports. Nobody can see them until you allow it for a person (Settings, People and access). You can restore them at any time."
        onClose={() => setDeleting(false)}
        onOk={() => { l.values[E.ARCHIVED] = new Date().toISOString(); l.values[E.ARCHIVED + 'By'] = session.owner ? 'Owner' : ''; log('Leaver archived', 'The leaver was archived and hidden.', l.values.name || l.id); setDeleting(false); go('leavers'); commit() }}
      />
    </div>
  )
}
