import { useState } from 'react'
import { Button } from '@heroui/react'
import { setRuleActive } from '../lib/tasks'
import { refreshSnapshot } from '../lib/snapshot'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { SECTIONS, display } from '../lib/fields'
import { commit, session, useApp } from '../lib/store'
import { can, canSeeArchive, hasExtra } from '../lib/rbac'
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
        title={l.values.name || l.values.empId || '(no name)'}
        sub={`${l.values.dept || ''} · ${reason ? reason.name : 'No reason set'} · ${subDate(s)}`}
        actions={<>
          {can('leavers', 'edit') && !archived && <Button variant="secondary" onPress={() => setEditing(true)}>Edit details</Button>}
          {archived
            ? hasExtra('restore') && <Button variant="secondary" onPress={() => { delete l.values[E.ARCHIVED]; delete l.values[E.ARCHIVED + 'By']; l.values[E.KEEP] = '1'; log('Leaver restored', 'The leaver was taken out of the archive.', l.values.name || l.id); commit() }}>Restore</Button>
            : hasExtra('archive') && <Button variant="danger-soft" onPress={() => setDeleting(true)}>Archive</Button>}
        </>}
      />
      {archived && <p role="status" className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm"><b>Archived.</b> This leaver is hidden from everyone except people the Owner has allowed. {hasExtra('restore') ? 'Press Restore to bring them back.' : 'Only the Owner, or a role allowed to restore, can bring them back.'}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass-card rounded-3xl p-5 lg:col-span-1" aria-label="Progress">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Progress</p>
              <p className="num font-serif text-5xl font-semibold leading-none">{sum.pct}<span className="text-2xl text-muted">%</span></p>
            </div>
            <StatusChip text={sum.status} />
          </div>
          <div className="mt-4"><Meter pct={sum.pct} label="Progress" /></div>
          <p className="mt-2 text-sm text-muted">{sum.done} of {sum.base} tasks done{sum.waived ? ` · ${sum.waived} waived` : ''}{sum.open ? ` · ${sum.open} open` : ''}</p>
          {(sum.overdue > 0 || sum.blocked > 0 || sum.dueSoon > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {sum.overdue > 0 && <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger">{sum.overdue} overdue</span>}
              {sum.blocked > 0 && <span className="rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs font-semibold">{sum.blocked} blocked</span>}
              {sum.dueSoon > 0 && <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-warning">{sum.dueSoon} due soon</span>}
            </div>
          )}
          <div className="mt-4 rounded-2xl bg-foreground/5 p-3 text-sm">
            <p className="text-muted">Notice check</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2">
              {n.tone === 'none' ? <span className="text-muted">Not applicable</span> : <StatusChip text={n.text} />}
              {n.need && <span className="text-muted">needs {fmt(n.need)} ({n.months} mo)</span>}
            </p>
          </div>
        </section>

        <section className="glass-card rounded-3xl p-5 lg:col-span-2" aria-label="Details">
          {missing.length > 0 && (
            <p role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-warning/10 px-3 py-2 text-sm">
              <b>Missing:</b>{missing.map((m) => <span key={m} className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium">{m}</span>)}
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            {SECTIONS.map((sec) => {
              const fs = s.fields.filter((f) => f.key !== 'name' && f.type !== 'textarea' && (f.section || 'Other') === sec)
              if (!fs.length) return null
              return (
                <div key={sec} className={sec === 'Dates' ? 'sm:col-span-2' : ''}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{sec}</h3>
                  <dl className={`grid gap-x-6 gap-y-3 text-sm ${sec === 'Dates' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
                    {fs.map((f) => {
                      const v = l.values[f.key]
                      const key = f.key === 'empId' || f.key === 'lwd'
                      return (
                        <div key={f.key} className="min-w-0">
                          <dt className="text-xs text-muted">{f.label}</dt>
                          <dd className={`break-words ${!v ? 'text-muted' : key ? 'font-semibold' : 'font-medium'}`}>{v ? display(s, f, v) : '—'}</dd>
                        </div>
                      )
                    })}
                  </dl>
                </div>
              )
            })}
          </div>
          {s.fields.filter((f) => f.type === 'textarea' && l.values[f.key]).map((f) => (
            <div key={f.key} className="mt-5 rounded-2xl bg-foreground/5 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{f.label}</p>
              <p className="mt-1 whitespace-pre-wrap">{l.values[f.key]}</p>
            </div>
          ))}
        </section>
      </div>

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
        onOk={() => { l.values[E.ARCHIVED] = new Date().toISOString(); l.values[E.ARCHIVED + 'By'] = session.owner ? 'Owner' : session.role; log('Leaver archived', 'The leaver was archived and hidden.', l.values.name || l.id); setDeleting(false); go('leavers'); commit() }}
      />
    </div>
  )
}
