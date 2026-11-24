import { useState } from 'react'
import { Button } from '@heroui/react'
import * as E from '../lib/engine'
import { ensureSnapshot } from '../lib/snapshot'
import { SECTIONS, display, optionsOf } from '../lib/fields'
import { commit, uid, useApp } from '../lib/store'
import { afterClose, useLive } from '../lib/live'
import { can, canSeeArchive } from '../lib/rbac'
import { log } from '../lib/audit'
import type { Field, Leaver } from '../lib/types'
import { useNav } from '../ui/nav'
import { Check, DataTable, Dialog, Empty, LongText, PageHead, Pager, Pick, ProgressCell, StatusBadge, StatusChip, TextInput, stripe, usePaged } from '../ui/kit'
import { subDate } from './Dashboard'

const LEAVER_STATUSES = ['Not Started', 'In Progress', 'Due Soon', 'Overdue', 'Blocked', 'Completed', 'Set Reason']

export function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const s = useApp()
  const label = f.label + (f.required ? ' *' : '')
  if (f.type === 'checkbox') return <Check label={f.label} checked={!!value} onChange={(v) => onChange(v ? '1' : '')} />
  if (f.type === 'textarea') return <LongText label={label} value={value} onChange={onChange} />
  if (f.type === 'select' || f.type === 'reason') return <Pick label={label} value={value} onChange={onChange} options={(() => { const o = optionsOf(s, f); return value && !o.some((x) => x.v === value) ? [...o, { v: value, l: value }] : o })()} />
  return <TextInput label={label} value={value} onChange={onChange} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} />
}

export function LeaverForm({ leaver, onClose }: { leaver: Leaver | null; onClose: () => void }) {
  const s = useApp()
  const [vals, setVals] = useState<Record<string, string>>({ ...(leaver?.values ?? {}) })
  const [err, setErr] = useState('')
  const save = () => {
    if (!vals.name?.trim()) return setErr('Enter the employee name.')
    const l = leaver ?? { id: uid(), values: {}, tasks: {} }
    const changes: string[] = []
    s.fields.forEach((f) => { if (vals[f.key] !== undefined) { const nv = vals[f.key].trim(); if (leaver && (l.values[f.key] ?? '') !== nv) changes.push(`${f.label}: ${l.values[f.key] || 'empty'} to ${nv || 'empty'}`); l.values[f.key] = nv } })
    if (!leaver) { ensureSnapshot(s, l); s.leavers.push(l) }
    log(leaver ? 'Leaver edited' : 'Leaver added', leaver ? (changes.length ? changes.join('; ') + '.' : 'Saved without changes.') : 'New leaver added.', l.values.name || l.id)
    commit(); onClose()
  }
  return (
    <Dialog open onClose={onClose} wide title={leaver ? 'Edit leaver' : 'Add leaver'}
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button onPress={save}>Save leaver</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((sec) => {
          const fs = s.fields.filter((x) => (x.section || 'Other') === sec)
          if (!fs.length) return null
          return [
            <h3 key={sec} className="font-serif text-lg sm:col-span-2">{sec}</h3>,
            ...fs.map((f) => <FieldInput key={f.key} f={f} value={vals[f.key] ?? ''} onChange={(v) => setVals((p) => ({ ...p, [f.key]: v }))} />),
          ]
        })}
        <p className="text-sm text-muted sm:col-span-2">Fields marked * are required. Add or change fields in Settings → Leaver form.</p>
        {err && <p className="text-sm text-danger sm:col-span-2" role="alert">{err}</p>}
      </div>
    </Dialog>
  )
}

export default function Leavers() {
  const s = useApp()
  const { go } = useNav()
  const [q, setQ] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('')
  const [adding, setAdding] = useState(false)
  const live = useLive()
  const closed = afterClose(live, s.settings)

  const [showArchived, setShowArchived] = useState(false)
  const viewArchive = showArchived && canSeeArchive()
  const pool = viewArchive ? E.archivedLeavers(s) : E.liveLeavers(s)
  const list = pool.map((l) => ({ l, sum: E.summary(s, l) })).filter((x) => {
    if (q && Object.entries(x.l.values).filter(([k]) => !k.startsWith('__')).map(([, v]) => v).join(' ').toLowerCase().indexOf(q.toLowerCase()) < 0) return false
    if (reason && x.l.values.reason !== reason) return false
    return !status || x.sum.status === status
  })
  const pg = usePaged(list, `${q}|${reason}|${status}`)
  const cols = s.fields.filter((f) => f.showInList && f.key !== 'name' && f.key !== 'reason')
  const rf = E.fieldByKey(s, 'reason')

  return (
    <div>
      <PageHead title="Leavers" sub={viewArchive ? `${pool.length} archived. Only people the Owner allowed can see these.` : `${pool.length} on record. ${subDate(s)}`}
        actions={<>
          {canSeeArchive() && <Button variant={viewArchive ? 'primary' : 'secondary'} onPress={() => setShowArchived(!viewArchive)}>{viewArchive ? 'Back to leavers' : `Archived (${E.archivedLeavers(s).length})`}</Button>}
          {can('leavers', 'edit') && <Button isDisabled={closed} onPress={() => setAdding(true)}>Add leaver</Button>}
        </>} />
      {closed && <p role="status" className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm">The working day ended at <b>{live.endTime}</b>. Adding leavers is closed until tomorrow.</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <TextInput label="Search" type="search" value={q} onChange={setQ} placeholder="Search any field" />
        <Pick label="Reason" value={reason || '__all'} onChange={(v) => setReason(v === '__all' ? '' : v)} options={[{ v: '__all', l: 'All reasons' }, ...s.reasons.map((r) => ({ v: r.id, l: r.name }))]} />
        <Pick label="Status" value={status || '__all'} onChange={(v) => setStatus(v === '__all' ? '' : v)} options={[{ v: '__all', l: 'All statuses' }, ...LEAVER_STATUSES.map((x) => ({ v: x, l: x }))]} />
      </div>
      {!list.length ? <Empty>No leavers match.</Empty> : (
        <DataTable
          label="Leavers"
          cols={[{ key: 'n', label: 'Name' }, ...cols.map((c) => ({ key: c.key, label: c.label })), { key: 'r', label: 'Reason' }, { key: 'p', label: 'Progress' }, { key: 'o', label: 'Overdue', align: 'end' }, { key: 'la', label: 'Late', align: 'end' }, { key: 'nt', label: 'Notice' }, { key: 's', label: 'Status' }]}
          rows={pg.rows.map(({ l, sum }) => {
            const n = E.noticeCheck(s, l)
            return {
              id: l.id, className: stripe(sum.status), onAction: () => go('leavers', l.id),
              cells: [
                <b key="n" className="whitespace-nowrap">{l.values.name || '(no name)'}</b>,
                ...cols.map((c) => display(s, c, l.values[c.key])),
                display(s, rf, l.values.reason),
                <ProgressCell key="p" pct={sum.pct} done={sum.done} total={sum.base} status={sum.status} />,
                sum.overdue, sum.late,
                n.tone === 'none' ? <span key="nt" className="text-muted">n/a</span> : <StatusChip key="nt" text={n.text} />,
                <StatusBadge key="s" status={sum.status} />,
              ],
            }
          })}
        />
      )}
      {!!list.length && <Pager {...pg} />}
      {adding && <LeaverForm leaver={null} onClose={() => setAdding(false)} />}
    </div>
  )
}
