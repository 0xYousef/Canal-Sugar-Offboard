import { Fragment, Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { Button, Card, Dropdown, Input, Tabs, TextField } from '@heroui/react'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { FIELD_TYPES, SECTIONS, slugKey } from '../lib/fields'
import { cancelEdit, commit, hasUnsaved, isEditing, saveEdit, startEdit, useApp } from '../lib/store'
import { log } from '../lib/audit'
import { can, hasExtra, isOwner, teamChanged, useRbac } from '../lib/rbac'

const isAdmin = () => can('settings', 'edit')
/** A box can be changed only by someone allowed to, and only after pressing its own Edit. */
const canEdit = (id: string) => isAdmin() && isEditing(id)

const BOX_NAME: Record<string, string> = { calendar: 'calendar and alerts', notice: 'notice-period check', holidays: 'holidays', fields: 'leaver form', sla: 'deadlines', actions: 'actions', slawf: 'SLA workflow', reasons: 'termination reasons', teams: 'teams' }

/** Edit / Cancel / Save changes for one box. Only one box is edited at a time, so the others wait. */
function EditButtons({ id }: { id: string }) {
  useApp()
  if (!isAdmin()) return null
  const mine = isEditing(id), other = isEditing() && !mine
  const save = () => { saveEdit(); log('Settings saved', 'Configuration changes were saved.'); toast.success('Changes saved') }
  const cancel = () => { cancelEdit(); toast.success('Changes dropped') }
  return mine
    ? <span className="flex shrink-0 gap-2"><Button size="sm" variant="tertiary" onPress={cancel}>Cancel</Button><Button size="sm" isDisabled={!hasUnsaved()} onPress={save}>Save changes</Button></span>
    : <Button size="sm" variant="secondary" isDisabled={other} onPress={() => startEdit(id)} aria-label={`Edit ${BOX_NAME[id] ?? id}`}>Edit</Button>
}

/** The strip above a list or table: what state it is in, and its own Edit button. */
function BoxBar({ id, note }: { id: string; note?: ReactNode }) {
  useApp()
  const mine = isEditing(id), other = isEditing() && !mine
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-foreground/5 px-4 py-2.5">
      <span className="min-w-0 text-sm text-muted">
        {mine ? (hasUnsaved() ? <b className="text-foreground">You have changes that are not saved yet.</b> : <b className="text-foreground">Editing.</b>) : other ? 'Save or cancel the box you are editing first.' : 'Read-only.'}
        {' '}{mine ? 'Press Save changes to apply them, or Cancel to drop them.' : other ? '' : 'Press Edit to change it.'}{note ? <> {note}</> : null}
      </span>
      <EditButtons id={id} />
    </div>
  )
}
import type { Dependency, Field, FieldType, Member, Need, Step, StepAction, WorkflowAction } from '../lib/types'
import { flowOf, isStepAction, rulesUsing, stepActionsOf } from '../lib/workflow'
import { membersOf, waitsFor } from '../lib/tasks'
import { refreshSnapshot } from '../lib/snapshot'
import { atlasReady } from '../lib/atlas'
import { useNav } from '../ui/nav'
import { minutesToClose, removeSharedFile, saveLiveSettings, useLive } from '../lib/live'
import { toast } from '@heroui/react'
import { session } from '../lib/store'
import { Check, Confirm, Toggle, DataTable, Dialog, LongText, PageHead, Pager, Pick, TextInput, usePaged } from '../ui/kit'

const Users = lazy(() => import('./settings/Users'))
const Sources = lazy(() => import('./settings/Sources'))
const Access = lazy(() => import('./settings/Access'))
const DatabaseCopy = lazy(() => import('./settings/DatabaseCopy'))
const Activity = lazy(() => import('./settings/Activity'))
type Topic = 'general' | 'fields' | 'lists' | 'sla' | 'workflow' | 'people' | 'connect' | 'activity' | 'data'
const TOPICS: { id: Topic; title: string; text: string; owner?: boolean; advanced?: boolean }[] = [
  { id: 'general', title: 'Calendar and alerts', text: 'Weekend days, public holidays, and when a task counts as due soon.' },
  { id: 'fields', title: 'Leaver form', text: 'The questions asked when you add a leaver, such as department or dates.' },
  { id: 'lists', title: 'Reasons and teams', text: 'Why people leave, and the teams that own tasks.' },
  { id: 'sla', title: 'Task time limits', text: 'How many days each task is allowed to take.', advanced: true },
  { id: 'workflow', title: 'Workflow', text: 'Two parts: the actions anyone can take on a task, and the actions each SLA rule has of its own.', advanced: true },
  { id: 'people', title: 'People and access', text: 'Who can sign in, and what each role may see, edit or take action on.', owner: true },
  { id: 'connect', title: 'Import leavers', text: 'Read a leaver list from a CSV, Excel or JSON file on this computer.' },
  { id: 'activity', title: 'Activity log', text: 'Who did what and to which employee. Filter it, export to Excel, or clear it.' },
  { id: 'data', title: 'Database', text: 'Connection status, and a shared copy of everything in MongoDB.', owner: true },
]

/** Two small screens in one topic, switched by a pair of tabs. */
function Pair({ items }: { items: [string, string, ReactNode][] }) {
  const { topic, tab, setSub } = useNav()
  const cur = items.find((x) => x[0] === tab) ?? items[0]
  const [pending, setPending] = useState<string | null>(null)
  const choose = (id: string) => { if (id === cur[0]) return; if (hasUnsaved()) setPending(id); else { cancelEdit(); setSub(topic ?? null, id, true) } }
  return (
    <>
      <Tabs selectedKey={cur[0]} onSelectionChange={(x) => choose(String(x))} className="mb-6">
        <Tabs.ListContainer><Tabs.List aria-label="Choose">{items.map(([id, label]) => <Tabs.Tab key={id} id={id}>{label}<Tabs.Indicator /></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
      </Tabs>
      <Suspense fallback={null}>{cur[2]}</Suspense>
      <Confirm open={!!pending} title="Drop your changes?" text="The box you were editing has changes that are not saved. Switching now discards them." onClose={() => setPending(null)}
        onOk={() => { cancelEdit(); setSub(topic ?? null, pending, true); setPending(null) }} />
    </>
  )
}

const move = <T,>(arr: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; commit() }
const sectionCard = (title: string, children: ReactNode, note?: string, editId?: string) => (
  <Card className="mb-4">
    <Card.Header className="flex-row items-start justify-between gap-3">
      <div className="min-w-0"><Card.Title>{title}</Card.Title>{note && <Card.Description>{note}</Card.Description>}</div>
      {editId && <EditButtons id={editId} />}
    </Card.Header>
    <Card.Content>{children}</Card.Content>
  </Card>
)

/** Text input that commits on blur, for names where every keystroke must not rewrite state. */
function Draft({ value, onCommit, label, disabled, plain, placeholder }: { value: string; onCommit: (v: string) => void; label: string; disabled?: boolean; plain?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <TextField value={v} onChange={setV} onBlur={() => onCommit(v)} isDisabled={disabled} aria-label={label} className={plain ? 'ghost-input' : undefined}>
      <Input placeholder={placeholder} />
    </TextField>
  )
}

/** The people of one team: a short table (name, job title) and one row to add another. */
function Members({ team, off }: { team: string; off: boolean }) {
  const s = useApp()
  const [name, setName] = useState(''), [title, setTitle] = useState('')
  const list = membersOf(s, team)
  const save = (next: Member[]) => { s.members ??= {}; s.members[team] = next; commit() }
  const dup = !!name.trim() && list.some((x) => x.name.toLowerCase() === name.trim().toLowerCase())
  const add = () => {
    const n = name.trim()
    if (!n || dup) return
    save([...list, { name: n, ...(title.trim() ? { title: title.trim() } : {}) }]); setName(''); setTitle('')
  }
  const set = (i: number, patch: Partial<Member>) => {
    const m = { ...list[i], ...patch }
    if (!m.name.trim()) return
    if (!m.title?.trim()) delete m.title
    save(list.map((x, k) => (k === i ? m : x)))
  }
  return (
    <div className="grid gap-4">
      {list.length === 0
        ? <p className="rounded-2xl bg-foreground/5 p-4 text-sm text-muted">Nobody is listed in {team} yet. Add the people who carry out its tasks, so you can say who did each one.</p>
        : (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
            <span className="px-3 text-xs font-medium uppercase tracking-wide text-muted">Name</span>
            <span className="px-3 text-xs font-medium uppercase tracking-wide text-muted">Job title</span>
            <span />
            {list.map((m, i) => (
              <Fragment key={m.name + i}>
                <Draft plain label={`Name of member ${m.name}`} value={m.name} disabled={off}
                  onCommit={(v) => { const n = v.trim(); if (n && n !== m.name && list.some((x, k) => k !== i && x.name.toLowerCase() === n.toLowerCase())) return; set(i, { name: n }) }} />
                <Draft plain label={`Job title of ${m.name}`} value={m.title ?? ''} placeholder="Job title" disabled={off} onCommit={(v) => set(i, { title: v.trim() })} />
                <IconBtn danger label={`Remove ${m.name} from ${team}`} d={TRASH} disabled={off} onClick={() => save(list.filter((_, k) => k !== i))} />
              </Fragment>
            ))}
          </div>
        )}
      <form className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 border-t border-separator pt-4 max-sm:grid-cols-1" onSubmit={(e) => { e.preventDefault(); add() }}>
        <TextInput label="Add a member" value={name} onChange={setName} disabled={off} placeholder="Full name" />
        <TextInput label="Job title" value={title} onChange={setTitle} disabled={off} placeholder="e.g. IT Support Engineer" />
        <Button type="submit" className="h-[38px] px-6 max-sm:w-full" isDisabled={off || !name.trim() || dup}>Add</Button>
      </form>
      {dup && <p role="alert" className="-mt-2 text-sm text-danger">{name.trim()} is already in {team}.</p>}
    </div>
  )
}

export default function Settings() {
  useApp(); useRbac()
  const { topic: topicId, setSub } = useNav()
  const topic = (TOPICS.some((t) => t.id === topicId) ? topicId : null) as Topic | null
  const setTopic = (t: Topic | null) => setSub(t)
  const [discard, setDiscard] = useState(false)
  // Leaving Settings with unsaved edits drops them, so edit mode never lingers on another page.
  useEffect(() => () => cancelEdit(), [])
  useEffect(() => () => cancelEdit(), [topic])
  const list = TOPICS.filter((t) => (isOwner() || !t.owner) && (t.id === 'activity' ? can('logs', 'view') : can('settings', 'view')))
  const cur = list.find((t) => t.id === topic)
  const sub = isAdmin() ? 'Pick what you want to change. Each box has its own Edit button; changes apply once you press Save changes on that box.' : 'You can look at these settings but not change them.'

  const back = () => { if (hasUnsaved()) setDiscard(true); else { cancelEdit(); setTopic(null) } }

  if (!cur) {
    return (
      <div>
        <PageHead title="Settings" sub={sub} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <button key={t.id} onClick={() => setTopic(t.id)} className="panel group flex flex-col items-stretch justify-start rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent">
              <span className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold">{t.title}</span>
                <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" fill="currentColor" aria-hidden="true"><path d="m10 6-1.4 1.4L13.2 12l-4.6 4.6L10 18l6-6-6-6Z" /></svg>
              </span>
              <span className="mt-1 block text-sm text-muted">{t.text}</span>
              {(t.advanced || t.owner) && <span className="mt-3 inline-block rounded-full bg-default px-2.5 py-0.5 text-xs text-muted">{t.owner ? 'Owner only' : 'For experts'}</span>}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div>
      <PageHead title={cur.title} sub={cur.text} onBack={back} />
      <Confirm open={discard} title="Drop your changes?" text="You have changes that are not saved. Leaving now discards them." onClose={() => setDiscard(false)} onOk={() => { cancelEdit(); setDiscard(false); setTopic(null) }} />
      {cur.id === 'general' && <General />}
      {cur.id === 'fields' && <Fields />}
      {cur.id === 'lists' && <Lists />}
      {cur.id === 'sla' && <Sla />}
      {cur.id === 'workflow' && <Workflow />}
      {cur.id === 'activity' && <Suspense fallback={null}><Activity /></Suspense>}
      {cur.id === 'data' && isOwner() && <Data />}
      {cur.id === 'people' && isOwner() && <Pair items={[['users', 'People', <Users />], ['access', 'Roles and permissions', <Access />]]} />}
      {cur.id === 'connect' && <Suspense fallback={null}><Sources /></Suspense>}
    </div>
  )
}

/* ---------------- General ---------------- */
function General() {
  const s = useApp()
  const st = s.settings, n = st.notice
  const offCal = !canEdit('calendar'), offNotice = !canEdit('notice'), offHol = !canEdit('holidays')
  const dateOpts = s.fields.filter((f) => f.type === 'date').map((f) => ({ v: f.key, l: f.label }))
  const [hd, setHd] = useState(''), [hn, setHn] = useState('')
  const numSet = (set: (v: number) => void) => (v: string) => { set(Number(v)); commit() }
  return (
    <>
      {sectionCard('Calendar and alerts', (
        <div className="grid gap-4 sm:grid-cols-3">
          <Pick label="Weekend" disabled={offCal} value={st.weekend} onChange={(v) => { st.weekend = v as 'FS' | 'SS'; commit() }} options={[{ v: 'FS', l: 'Friday + Saturday' }, { v: 'SS', l: 'Saturday + Sunday' }]} />
          <TextInput label="Due Soon window (days)" type="number" disabled={offCal} value={String(st.dueSoon)} onChange={numSet((v) => { st.dueSoon = v })} />
          <TextInput label="Report date override (optional)" type="date" disabled={offCal} value={st.reportDate} onChange={(v) => { st.reportDate = v; commit() }} />
        </div>
      ), undefined, 'calendar')}
      <WorkingDay />
      {sectionCard('Notice-period check', (
        <div className="grid gap-4 sm:grid-cols-3">
          <Pick label="Hire date field" disabled={offNotice} value={n.hireField} onChange={(v) => { n.hireField = v; commit() }} options={dateOpts} />
          <Pick label="Request date field" disabled={offNotice} value={n.requestField} onChange={(v) => { n.requestField = v; commit() }} options={dateOpts} />
          <Pick label="Leaving date field" disabled={offNotice} value={n.endField} onChange={(v) => { n.endField = v; commit() }} options={dateOpts} />
          <TextInput label="Service threshold (years)" type="number" disabled={offNotice} value={String(n.years)} onChange={numSet((v) => { n.years = v })} />
          <TextInput label="Months when service ≤ threshold" type="number" disabled={offNotice} value={String(n.short)} onChange={numSet((v) => { n.short = v })} />
          <TextInput label="Months when service > threshold" type="number" disabled={offNotice} value={String(n.long)} onChange={numSet((v) => { n.long = v })} />
        </div>
      ), 'Applies to reasons flagged "notice" in Reasons & groups. Choose which date fields it reads.', 'notice')}
      {sectionCard('Holidays', (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <TextInput label="Date" type="date" disabled={offHol} value={hd} onChange={setHd} />
            <TextInput label="Holiday name" disabled={offHol} value={hn} onChange={setHn} />
            <Button variant="secondary" isDisabled={offHol || !hd} onPress={() => { st.holidays.push({ date: hd, name: hn || 'Holiday' }); setHd(''); setHn(''); commit() }}>Add holiday</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {st.holidays.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((h) => (
              <span key={h.date} className="inline-flex items-center gap-1.5 rounded-full bg-default px-3 py-1 text-sm">
                {fmt(h.date)} · {h.name}
                {!offHol && <button aria-label={`Remove ${h.name}`} className="text-muted hover:text-danger" onClick={() => { st.holidays = st.holidays.filter((x) => x.date !== h.date); commit() }}>×</button>}
              </span>
            ))}
          </div>
        </>
      ), 'Working-day (WD) rules skip these. Add Eids and Sham El-Nessim yourself.', 'holidays')}
    </>
  )
}

/* ---------------- End of the working day ---------------- */
function WorkingDay() {
  const live = useLive()
  const can_ = isOwner() || session.role === 'Admin'
  const [time, setTime] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [ask, setAsk] = useState(false)
  const t = time ?? live.endTime
  const s0 = useApp()
  const lockOn = s0.settings.lockAfterClose ?? live.enabled
  const left = minutesToClose(live)
  const run = async (f: () => Promise<void>, ok: string) => { setBusy(true); try { await f(); toast.success(ok) } catch (e) { toast.danger(e instanceof Error ? e.message : String(e)) } setBusy(false) }
  const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
  return sectionCard('End of the working day', !atlasReady() ? (
    <p className="text-sm text-muted">The shared sheet needs the database. Add <code>VITE_DB_URL</code> to the .env file first.</p>
  ) : (
    <div className="grid gap-4">
      <p className="text-sm">
        Everyone signed in works on the same sheet, and changes show on every screen within a few seconds.
        {live.sheet ? <> Today’s file: <b>{live.sheet.name}</b>, loaded by {live.sheet.by}.</> : ' No file is loaded.'}
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <Toggle on={live.enabled} disabled={!can_ || busy} label="Remove the file from the server at closing time" onChange={(v) => void run(() => saveLiveSettings(v, t), v ? `The file will be removed at ${t} every day` : 'The file stays on the server')} />
        <TextInput label="Closing time" type="time" disabled={!can_} value={t} onChange={setTime} />
        <Button variant="secondary" isDisabled={!can_ || busy || t === live.endTime} onPress={() => void run(() => saveLiveSettings(live.enabled, t), 'Closing time saved')}>Save time</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-foreground/5 px-4 py-3">
        <Toggle on={lockOn} disabled={!can_} label="Block adding leavers and imports after closing time" onChange={(v) => { s0.settings.lockAfterClose = v; commit(); toast.success(v ? 'Adding is blocked after the closing time' : 'Adding stays open after the closing time') }}>
          <span className="text-sm font-medium">Block adding leavers and imports after the closing time</span>
        </Toggle>
        <span className="text-xs text-muted">Turn it off to keep Add leaver and Import available all day.</span>
      </div>
      <p className="text-sm text-muted">
        Server time is {hh(live.nowMin + (Date.now() - live.readAt) / 60000)}.
        {live.enabled && left !== null && left > 0 ? ` The file will be removed in ${Math.round(left)} minutes.` : live.enabled ? ' The next removal is tomorrow at closing time.' : ''}
        {' '}People see a warning 30 minutes before, and the rules popup tells everyone.
      </p>
      <div><Button variant="danger" isDisabled={!hasExtra('removeFile') || busy} onPress={() => setAsk(true)}>Remove the file now</Button></div>
      <Confirm open={ask} title="Remove the shared file?" text="Every leaver and task on the server is deleted for everyone, right now. Export first if you need a copy." onClose={() => setAsk(false)} onOk={() => void run(removeSharedFile, 'The shared file was removed')} />
      {!can_ && <p className="text-sm text-muted">Only the Owner or an Admin can change this.</p>}
    </div>
  ))
}

/* ---------------- Fields ---------------- */
function Fields() {
  const s = useApp()
  const off = !canEdit('fields')
  const [edit, setEdit] = useState<{ f: Field | null } | null>(null)
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)
  const [del, setDel] = useState<string | null>(null)
  const use = E.usage(s)
  return (
    <>
      <BoxBar id="fields" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">Fields drive the Add/Edit form, the leaver page, list columns, reports and exports. Date fields can start an SLA clock.</p>
        <Button isDisabled={off} onPress={() => setEdit({ f: null })}>Add field</Button>
      </div>
      <DataTable label="Fields"
        cols={[{ key: 'l', label: 'Label' }, { key: 'k', label: 'Key' }, { key: 't', label: 'Type' }, { key: 's', label: 'Section' }, { key: 'r', label: 'Required' }, { key: 'li', label: 'In list' }, { key: 'u', label: 'Used by' }, { key: 'a', label: '' }]}
        rows={s.fields.map((f, i) => ({
          id: f.key,
          cells: [
            <span key="l"><b>{f.label}</b>{f.builtin && <span className="ml-1 text-xs text-muted">built-in</span>}</span>,
            <code key="k" className="text-xs">{f.key}</code>,
            f.type === 'reason' ? 'Reason list' : FIELD_TYPES.find((t) => t.id === f.type)?.label ?? f.type,
            f.section,
            f.required ? 'Always' : f.requiredFor.length ? `For ${f.requiredFor.length} reason(s)` : '—',
            f.showInList ? 'Yes' : '—',
            <span key="u" className="text-sm text-muted">{use.field(f.key).join(', ') || '—'}</span>,
            <div key="a" className="flex gap-1">
              <Button size="sm" variant="ghost" isIconOnly aria-label="Move up" isDisabled={off} onPress={() => move(s.fields, i, -1)}>↑</Button>
              <Button size="sm" variant="ghost" isIconOnly aria-label="Move down" isDisabled={off} onPress={() => move(s.fields, i, 1)}>↓</Button>
              <Button size="sm" variant="secondary" isDisabled={off} onPress={() => setEdit({ f })}>Edit</Button>
              {!f.builtin && <Button size="sm" variant="danger-soft" isDisabled={off} onPress={() => {
                const used = use.field(f.key)
                if (used.length) setInfo({ title: 'Field is in use', text: 'Remove it from these first: ' + used.join(', ') })
                else setDel(f.key)
              }}>Delete</Button>}
            </div>,
          ],
        }))} />
      {edit && <FieldForm f={edit.f} onClose={() => setEdit(null)} />}
      <Confirm open={!!info} title={info?.title ?? ''} text={info?.text} onClose={() => setInfo(null)} />
      <Confirm open={!!del} title="Delete this field?" text="Its values are removed from every leaver." onClose={() => setDel(null)}
        onOk={() => { s.fields = s.fields.filter((f) => f.key !== del); setDel(null); commit() }} />
    </>
  )
}

function FieldForm({ f, onClose }: { f: Field | null; onClose: () => void }) {
  const s = useApp()
  const isNew = !f
  const [label, setLabel] = useState(f?.label ?? '')
  const [key, setKey] = useState(f?.key ?? '')
  const [type, setType] = useState<FieldType>(f?.type ?? 'text')
  const [section, setSection] = useState(f?.section ?? 'Other')
  const [options, setOptions] = useState((f?.options ?? []).join('\n'))
  const [fallback, setFallback] = useState(f?.fallback ?? '')
  const [required, setRequired] = useState(f?.required ?? false)
  const [inList, setInList] = useState(f?.showInList ?? false)
  const [reqFor, setReqFor] = useState<string[]>(f?.requiredFor ?? [])
  const [err, setErr] = useState('')
  const dateOthers = s.fields.filter((x) => x.type === 'date' && x.key !== f?.key)

  const save = () => {
    if (!label.trim()) return setErr('Give the field a label.')
    let k = f?.key ?? ''
    if (isNew) {
      k = key.trim() || slugKey(label)
      if (!/^[a-z][a-zA-Z0-9]*$/.test(k)) return setErr('Key must start with a lowercase letter and use letters and digits only.')
      if (E.fieldByKey(s, k)) return setErr(`A field with key "${k}" already exists.`)
    }
    const opts = options.split('\n').map((x) => x.trim()).filter(Boolean)
    if (type === 'select' && !opts.length) return setErr('Add at least one dropdown option.')
    const data: Partial<Field> = { label: label.trim(), section, required, showInList: inList, requiredFor: reqFor }
    if (type === 'select') data.options = opts
    if (type === 'date') data.fallback = fallback || undefined
    if (isNew) s.fields.push({ key: k, type, builtin: false, ...data } as Field)
    else Object.assign(f!, data)
    commit(); onClose()
  }
  return (
    <Dialog open onClose={onClose} wide title={isNew ? 'Add field' : 'Edit field'}
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button onPress={save}>Save field</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Label" value={label} onChange={setLabel} />
        <TextInput label="Key (used by rules)" value={key} onChange={setKey} disabled={!isNew} placeholder="auto from label" />
        <Pick label="Type" value={type} onChange={(v) => setType(v as FieldType)} disabled={!isNew}
          options={[...FIELD_TYPES.map((t) => ({ v: t.id as string, l: t.label })), ...(f?.type === 'reason' ? [{ v: 'reason', l: 'Reason list' }] : [])]} />
        <Pick label="Section" value={section} onChange={setSection} options={SECTIONS.map((x) => ({ v: x, l: x }))} />
        {type === 'select' && <LongText label="Dropdown options (one per line)" value={options} onChange={setOptions} rows={4} />}
        {type === 'date' && <Pick label="If blank, use another date field" value={fallback || '__none'} onChange={(v) => setFallback(v === '__none' ? '' : v)} options={[{ v: '__none', l: 'No fallback' }, ...dateOthers.map((x) => ({ v: x.key, l: x.label }))]} />}
        <Check label="Always required" checked={required} onChange={setRequired} disabled={!isNew && f?.builtin} />
        <Check label="Show as a column in Leavers" checked={inList} onChange={setInList} />
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm text-muted">Required only for these reasons</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.reasons.map((r) => <Check key={r.id} label={r.name} checked={reqFor.includes(r.id)} onChange={(c) => setReqFor((p) => (c ? [...p, r.id] : p.filter((x) => x !== r.id)))} />)}
          </div>
        </div>
        {err && <p className="text-sm text-danger sm:col-span-2" role="alert">{err}</p>}
      </div>
    </Dialog>
  )
}

/* ---------------- SLA rules ---------------- */
const nextStepId = (s: ReturnType<typeof useApp>) => { let n = 1; while (E.stepById(s, 'CUS-' + String(n).padStart(2, '0'))) n++; return 'CUS-' + String(n).padStart(2, '0') }

/** Rule changes apply to leavers created from now on. This is the deliberate way to push the current rules onto leavers that already exist. */
function ApplyToExisting() {
  const s = useApp()
  const [ask, setAsk] = useState(false)
  return (
    <>
      <Button variant="secondary" isDisabled={!isAdmin() || isEditing() || !s.leavers.length} onPress={() => setAsk(true)}>Apply to existing leavers</Button>
      <Confirm open={ask} title="Apply the current rules to existing leavers?" onClose={() => setAsk(false)}
        text={`Every leaver (${s.leavers.length}) switches to the rules and actions saved now. Progress recorded on rules that no longer exist is hidden, and rules you switched off for one leaver stay off for them. This cannot be undone.`}
        onOk={() => { s.leavers.forEach((l) => refreshSnapshot(s, l)); log('Rules applied', `The current SLA rules were applied to ${s.leavers.length} existing leavers.`); setAsk(false); commit(); toast.success('Applied to existing leavers') }} />
    </>
  )
}

function Sla() {
  const s = useApp()
  const off = !canEdit('sla')
  const [edit, setEdit] = useState<{ step: Step | null } | null>(null)
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)
  const [del, setDel] = useState<string | null>(null)
  return (
    <>
      <BoxBar id="sla" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">{s.steps.length} steps. A rule says who owns a step, which date starts its clock and how long they have. Each leaver keeps the rules as they were when the leaver was created, so a change here applies to new leavers only. Use Apply to existing leavers to update the rest.</p>
        <span className="flex flex-wrap gap-2"><ApplyToExisting /><Button isDisabled={off} onPress={() => setEdit({ step: null })}>Add SLA rule</Button></span>
      </div>
      <DataTable label="SLA rules"
        cols={[{ key: 'i', label: 'ID' }, { key: 'on', label: 'On' }, { key: 't', label: 'Task' }, { key: 'o', label: 'Team' }, { key: 's', label: 'SLA' }, { key: 'ap', label: 'Who' }, { key: 'a', label: '' }]}
        rows={s.steps.map((st, i) => ({
          id: st.id,
          cells: [
            <code key="i" className="text-xs">{st.id}</code>,
            <Toggle key="on" on={st.active} disabled={off} label={`Active ${st.id}`} onChange={(v) => { st.active = v; commit() }} />,
            st.name, st.group,
            <span key="s" className="text-sm text-muted">{E.slaText(s, st)}</span>,
            <span key="ap" className="text-sm text-muted">{st.active ? 'New leavers' : 'Off for new leavers'}</span>,
            <div key="a" className="flex gap-1">
              <Button size="sm" variant="ghost" isIconOnly aria-label="Move up" isDisabled={off} onPress={() => move(s.steps, i, -1)}>↑</Button>
              <Button size="sm" variant="ghost" isIconOnly aria-label="Move down" isDisabled={off} onPress={() => move(s.steps, i, 1)}>↓</Button>
              <Button size="sm" variant="secondary" isDisabled={off} onPress={() => setEdit({ step: st })}>Edit</Button>
              <Button size="sm" variant="tertiary" isDisabled={off} onPress={() => { const c: Step = JSON.parse(JSON.stringify(st)); c.id = nextStepId(s); c.name += ' (copy)'; s.steps.push(c); commit() }}>Duplicate</Button>
              <Button size="sm" variant="danger-soft" isDisabled={off} onPress={() => {
                const used = E.usage(s).step(st.id)
                if (used.length) setInfo({ title: 'Step is in use', text: 'These rules start their clock from it: ' + used.join(', ') })
                else setDel(st.id)
              }}>Delete</Button>
            </div>,
          ],
        }))} />
      {edit && <StepForm step={edit.step} onClose={() => setEdit(null)} />}
      <Confirm open={!!info} title={info?.title ?? ''} text={info?.text} onClose={() => setInfo(null)} />
      <Confirm open={!!del} title="Delete this rule?" text="The rule is removed when you press Save changes. Tasks already recorded for it are no longer shown." onClose={() => setDel(null)}
        onOk={() => { s.steps = s.steps.filter((x) => x.id !== del); s.steps.forEach((x) => { if (x.dependsOn) x.dependsOn = x.dependsOn.filter((d) => d.step !== del) }); setDel(null); commit() }} />
    </>
  )
}

/** Two sections: the actions everyone can take on any task, and the actions each SLA rule has of its own. */
function Workflow() {
  return <Pair items={[['actions', 'Actions', <WorkflowActions key="a" />], ['sla', 'SLA workflow', <SlaWorkflow key="s" />]]} />
}

/** The task actions: add or remove any, name them, say what each does and asks for. Descriptions go to the activity log only. */
function WorkflowActions() {
  const s = useApp()
  const off = !canEdit('actions')
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)
  const list = flowOf(s)
  const save = (next: WorkflowAction[]) => { s.settings.flow = next; commit() }
  const set = (i: number, p: Partial<WorkflowAction>) => save(list.map((a, k) => (k === i ? { ...a, ...p } : a)))
  const add = () => save([...list, { id: 'w' + Date.now().toString(36), kind: 'done', label: 'New action', description: '', date: 'required', member: 'off', comment: 'off' }])
  const remove = (i: number) => {
    const a = list[i]
    const used = rulesUsing(s, a.id)
    if (used.length) return setInfo({ title: 'Used by SLA rules', text: `"${a.label}" is used by ${used.join(', ')}. Remove it from those rules first (SLA workflow).` })
    save(list.filter((_, k) => k !== i))
  }
  const mv = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list];[n[i], n[j]] = [n[j], n[i]]; save(n) }
  return (
    <div className="grid gap-4">
      <BoxBar id="actions" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">These are your own actions. They are the only choices in a task's "Take action" menu and in the bulk bar on the Tasks page, and nothing is built in. Taking one finishes the task unless you switch "Finishes the task" off: then the task stays open and shows the action's name as its status. A rule with its own actions (see SLA workflow) lists those first, and these stay available below them.</p>
        <Button isDisabled={off} onPress={add}>Add action</Button>
      </div>
      {!list.length && <p className="rounded-2xl bg-foreground/5 p-4 text-sm text-muted">No actions yet. Press <b>Edit</b>, then <b>Add action</b>. Until you add one, tasks cannot be finished from the menu.</p>}
      <ul className="grid gap-3">
        {list.map((w, i) => (
          <li key={w.id} className="panel grid gap-4 rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <Draft key={w.label} label={`Name of action ${i + 1}`} value={w.label} placeholder="Action name" disabled={off} onCommit={(v) => set(i, { label: v.trim() || w.label })} />
                <Draft key={'d' + w.id + (w.description ?? '')} label={`Description of ${w.label}`} value={w.description ?? ''} placeholder="Description (activity log only)" disabled={off} onCommit={(v) => set(i, { description: v.trim() })} />
              </div>
              <span className="flex shrink-0">
                <IconBtn label={`Move ${w.label} up`} d="m7 14 5-5 5 5H7Z" disabled={off || i === 0} onClick={() => mv(i, -1)} />
                <IconBtn label={`Move ${w.label} down`} d="m7 10 5 5 5-5H7Z" disabled={off || i === list.length - 1} onClick={() => mv(i, 1)} />
                <IconBtn danger label={`Remove ${w.label}`} d={TRASH} disabled={off} onClick={() => remove(i)} />
              </span>
            </div>
            {rulesUsing(s, w.id).length > 0 && <p className="-mb-2 text-xs text-muted">Used by {rulesUsing(s, w.id).length} SLA rule{rulesUsing(s, w.id).length === 1 ? '' : 's'}: {rulesUsing(s, w.id).slice(0, 8).join(', ')}{rulesUsing(s, w.id).length > 8 ? '…' : ''}</p>}
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Pick label="Date" value={w.date} onChange={(v) => set(i, { date: v as Need })} options={NEEDS} disabled={off} />
              <Pick label="Team member" value={w.member} onChange={(v) => set(i, { member: v as Need })} options={NEEDS} disabled={off} />
              <Pick label="Comment" value={w.comment} onChange={(v) => set(i, { comment: v as Need })} options={NEEDS} disabled={off} />
              <div className="pb-2"><Toggle on={w.finishes !== false} disabled={off} label={`${w.label} finishes the task`} onChange={(v) => set(i, { finishes: v })}><span className="text-sm">Finishes the task</span></Toggle></div>
            </div>
          </li>
        ))}
      </ul>
      <Confirm open={!!info} title={info?.title ?? ''} text={info?.text} onClose={() => setInfo(null)} />
    </div>
  )
}

/** SLA workflow: every SLA rule with its own actions, done in order. Opens the same editor the rule's actions are built in. */
function SlaWorkflow() {
  const s = useApp()
  const off = !canEdit('slawf')
  const [acts, setActs] = useState<string | null>(null)
  const [team, setTeam] = useState('')
  const [q, setQ] = useState('')
  const [only, setOnly] = useState(false)
  const rows = s.steps.filter((st) => (!team || st.group === team) && (!only || stepActionsOf(st).length > 0) && (!q || (st.id + ' ' + st.name).toLowerCase().includes(q.toLowerCase())))
  const pg = usePaged(rows, `${team}|${q}|${only}`, 10)
  const withActions = s.steps.filter((st) => stepActionsOf(st).length > 0).length
  return (
    <div className="grid gap-4">
      <BoxBar id="slawf" />
      <p className="max-w-3xl text-sm text-muted">Give an SLA rule its own actions, and say which other rules it waits for. People pick from your actions, an action can need earlier ones first, and the task finishes when the last one is done. <b>{withActions}</b> of {s.steps.length} rules have actions.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Pick label="Team" value={team || '__all'} onChange={(v) => setTeam(v === '__all' ? '' : v)} options={[{ v: '__all', l: 'All teams' }, ...s.groups.map((g) => ({ v: g, l: g }))]} />
        <TextInput label="Search" type="search" value={q} onChange={setQ} placeholder="Rule ID or task" />
        <div className="flex items-end pb-1.5"><Check label="Only rules that have actions" checked={only} onChange={setOnly} /></div>
      </div>
      {!rows.length ? <p className="rounded-2xl bg-foreground/5 p-4 text-sm text-muted">No rules match.</p> : (
        <>
          <DataTable label="SLA workflow"
            cols={[{ key: 'i', label: 'ID' }, { key: 't', label: 'Task' }, { key: 'o', label: 'Team' }, { key: 'a', label: 'Actions, in order' }, { key: 'w', label: 'Waits for' }, { key: 'b', label: '' }]}
            rows={pg.rows.map((st) => {
              const list = stepActionsOf(st)
              return {
                id: st.id,
                cells: [
                  <code key="i" className="text-xs">{st.id}</code>, st.name, st.group,
                  list.length
                    ? <span key="a" className="flex flex-wrap items-center gap-1 text-sm">{list.map((a, i) => <span key={a.id} className="flex items-center gap-1">{i > 0 && isStepAction(a) && list[i - 1] && isStepAction(list[i - 1]) && <span className="text-muted" aria-hidden="true">→</span>}<span className={isStepAction(a) ? 'rounded-full bg-foreground/8 px-2.5 py-0.5' : 'rounded-full border border-separator px-2.5 py-0.5 text-muted'} title={undefined}>{a.name}</span></span>)}</span>
                    : <span key="a" className="text-sm text-muted">None. Uses the plain actions.</span>,
                  (st.dependsOn ?? []).filter((d) => E.stepById(s, d.step)).length
                    ? <span key="w" className="flex flex-wrap gap-1 text-sm">{(st.dependsOn ?? []).filter((d) => E.stepById(s, d.step)).map((d) => { const t = E.stepById(s, d.step)!; const a = d.action ? stepActionsOf(t).find((x) => x.id === d.action) : undefined; return <span key={d.step} className="rounded-full border border-separator px-2.5 py-0.5">{t.id}{a ? ` · ${a.name}` : ''}</span> })}</span>
                    : <span key="w" className="text-sm text-muted">Nothing</span>,
                  <Button key="b" size="sm" variant={list.length ? 'secondary' : 'primary'} isDisabled={off} onPress={() => setActs(st.id)}>Configure</Button>,
                ],
              }
            })} />
          <Pager {...pg} />
        </>
      )}
      {acts && E.stepById(s, acts) && <ActionsDialog step={E.stepById(s, acts)!} onClose={() => setActs(null)} />}
    </div>
  )
}

const NEEDS: { v: Need; l: string }[] = [{ v: 'off', l: 'Not asked' }, { v: 'optional', l: 'Optional' }, { v: 'required', l: 'Required' }]

/** The actions of one SLA rule, picked from the configured ones (Workflow, Actions). The rule decides the order and which ones need earlier ones first. */
function ActionsDialog({ step, onClose }: { step: Step; onClose: () => void }) {
  const s = useApp()
  const raw = step.actions ?? []
  const shown = stepActionsOf(step)                 // what people will meet: removed picks are gone
  const list = raw.filter((a) => !a.ref || shown.some((x) => x.id === a.id))
  const save = (next: StepAction[]) => { step.actions = next; commit() }
  const set = (id: string, p: Partial<StepAction>) => save(list.map((a) => (a.id === id ? { ...a, ...p } : a)))
  /** An action may only need actions above it, so the order is the order they are done in and nothing can wait on itself. */
  const kindOf = (id: string) => shown.find((x) => x.id === id)
  const stepsAbove = (l: StepAction[], i: number) => l.slice(0, i).filter((x) => { const r = kindOf(x.id); return !r || isStepAction(r) })
  const tidy = (l: StepAction[]) => l.map((a, i) => ({ ...a, requires: (a.requires ?? []).filter((id) => stepsAbove(l, i).some((x) => x.id === id)) }))
  const mv = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list];[n[i], n[j]] = [n[j], n[i]]; save(tidy(n)) }
  const library = flowOf(s)
  const free = library.filter((w) => !list.some((a) => a.ref === w.id))
  const add = (id: string) => { const w = library.find((x) => x.id === id); if (w) save([...list, { id: 'a' + Date.now().toString(36), ref: w.id, kind: w.kind, name: w.label, description: w.description, date: w.date, member: w.member, comment: w.comment }]) }
  const need = (n: Need) => (n === 'required' ? 'required' : 'optional')
  const deps = (step.dependsOn ?? []).filter((d) => E.stepById(s, d.step))
  const saveDeps = (next: Dependency[]) => { step.dependsOn = next; commit() }
  const candidates = s.steps.filter((x) => x.id !== step.id && !deps.some((d) => d.step === x.id) && !waitsFor(s.steps, x.id, step.id))
  return (
    <Dialog open onClose={onClose} wide title={`Workflow for ${step.id}`}
      footer={<Button onPress={onClose}>Done</Button>}>
      <p className="mb-1 text-sm font-medium">{step.name}</p>
      <p className="mb-4 text-sm text-muted">The task is finished when every action below is done. An action can need the ones above it to be done first. Your other actions (such as Done) stay in the menu under these, so a task can still be finished directly. Actions come from your list under Workflow, Actions, so a change there applies here too.</p>
      {!shown.length && <p className="mb-3 rounded-2xl bg-foreground/5 p-4 text-sm text-muted">No actions yet. Pick one below.</p>}
      <ul className="mb-4 grid gap-3">
        {list.map((a, i) => {
          const r = shown.find((x) => x.id === a.id) ?? a
          const asks = [r.date !== 'off' && `date (${need(r.date)})`, r.member !== 'off' && `team member (${need(r.member)})`, r.comment !== 'off' && `comment (${need(r.comment)})`].filter(Boolean)
          return (
            <li key={a.id} className="panel grid gap-3 rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{i + 1}. {r.name}{!a.ref && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">Custom, not from the list</span>}</p>
                  <p className="text-xs text-muted">{asks.length ? 'Asks for ' + asks.join(', ') : 'Asks for nothing'}</p>
                </div>
                <span className="flex shrink-0">
                  <IconBtn label={`Move ${r.name} up`} d="m7 14 5-5 5 5H7Z" disabled={i === 0} onClick={() => mv(i, -1)} />
                  <IconBtn label={`Move ${r.name} down`} d="m7 10 5 5 5-5H7Z" disabled={i === list.length - 1} onClick={() => mv(i, 1)} />
                  <IconBtn danger label={`Remove ${r.name}`} d={TRASH} onClick={() => save(tidy(list.filter((x) => x.id !== a.id)))} />
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {isStepAction(r)
                  ? <span className="text-sm font-medium">{stepsAbove(list, i).length === 0 ? 'Can be done straight away.' : 'Needs first:'}</span>
                  : <span className="text-sm text-muted">Does not finish the task, so it is not one of the steps.</span>}
                {isStepAction(r) && stepsAbove(list, i).map((o) => (
                  <Check key={o.id} label={(shown.find((x) => x.id === o.id) ?? o).name} checked={(a.requires ?? []).includes(o.id)}
                    onChange={(c) => set(a.id, { requires: c ? [...(a.requires ?? []), o.id] : (a.requires ?? []).filter((x) => x !== o.id) })} />
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      <h3 className="mb-1 font-serif text-lg">Actions</h3>
      {free.length > 0
        ? <div className="max-w-sm"><Pick label="Add an action from the list" value="" placeholder="Choose an action…" onChange={add} options={free.map((w) => ({ v: w.id, l: w.label }))} /></div>
        : <p className="text-sm text-muted">{library.length ? 'Every configured action is already in this rule.' : 'No actions are configured.'} Add more under Workflow, Actions.</p>}
      <div className="mt-6 border-t border-separator pt-4">
        <h3 className="mb-1 font-serif text-lg">Waits for</h3>
        <p className="mb-3 text-sm text-muted">This rule cannot be acted on, for a leaver, until the action you pick on each rule below has been done for that same leaver. A rule that does not apply to the leaver never holds them up.</p>
        <ul className="mb-3 grid gap-3">
          {deps.map((d, i) => {
            const t = E.stepById(s, d.step)
            const opts = [{ v: '__task', l: 'The whole task is done' }, ...(t ? stepActionsOf(t).map((a) => ({ v: a.id, l: a.name })) : [])]
            const cur = d.action && opts.some((o) => o.v === d.action) ? d.action : '__task'
            const loop = !!t && waitsFor(s.steps, t.id, step.id)
            return (
              <li key={d.step} className="panel grid items-end gap-3 rounded-2xl p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="min-w-0"><p className="text-xs text-muted">Rule</p><p className="truncate font-semibold"><code className="mr-1 text-xs">{d.step}</code>{t?.name ?? 'Removed rule'}</p>{loop && <p className="text-xs text-warning">Ignored: {d.step} also waits for {step.id}, so they would block each other. Remove one of the two.</p>}</div>
                <Pick label="Must be done first" value={cur} onChange={(v) => saveDeps(deps.map((x, k) => (k === i ? { step: x.step, ...(v === '__task' ? {} : { action: v }) } : x)))} options={opts} />
                <IconBtn danger label={`Stop waiting for ${d.step}`} d={TRASH} onClick={() => saveDeps(deps.filter((_, k) => k !== i))} />
              </li>
            )
          })}
        </ul>
        {candidates.length > 0
          ? <div className="max-w-md"><Pick label="Wait for another rule" value="" placeholder="Choose a rule…" onChange={(id) => saveDeps([...deps, { step: id }])} options={candidates.map((x) => ({ v: x.id, l: `${x.id} · ${x.name.slice(0, 50)}` }))} /></div>
          : <p className="text-sm text-muted">No other rule can be added.</p>}
      </div>
    </Dialog>
  )
}

function StepForm({ step, onClose }: { step: Step | null; onClose: () => void }) {
  const s = useApp()
  const isNew = !step
  const [d, setD] = useState<Step>(() => step ? JSON.parse(JSON.stringify(step)) : {
    id: nextStepId(s), active: true, group: s.groups[0], name: '', start: { type: 'field', field: 'lwd' }, days: 0, when: 'After', unit: 'CD', applies: { mode: 'all', reasons: [] }, condition: null,
  })
  const [leaverId, setLeaverId] = useState(E.liveLeavers(s)[0]?.id ?? '')
  const [err, setErr] = useState('')
  const patch = (p: Partial<Step>) => setD((x) => ({ ...x, ...p }))
  const dateOpts = s.fields.filter((f) => f.type === 'date').map((f) => ({ v: f.key, l: f.label }))
  // A rule whose clock already starts from this one cannot be picked: the two would wait for each other forever.
  const others = s.steps.filter((x) => x.id !== d.id && !E.clockLoops(s.steps, x.id, d.id))
  const lv = E.getLeaver(s, leaverId)
  const r = lv ? E.evalTask(s, lv, d) : null

  const save = () => {
    if (!d.id || !/^[A-Za-z0-9_-]+$/.test(d.id)) return setErr('Step ID can use letters, digits, - and _ only.')
    if (isNew && E.stepById(s, d.id)) return setErr(`Step ID "${d.id}" already exists.`)
    if (!d.name.trim()) return setErr('Give the task a name.')
    if (d.start.type !== 'none' && d.days === null) return setErr('Enter the number of days, or choose "No SLA".')
    if (d.start.type === 'field' && !d.start.field) return setErr('Add a date field first (Settings → Leaver form).')
    if (d.start.type === 'step' && (!d.start.step || d.start.step === d.id)) return setErr('Choose a different step to start from.')
    const out: Step = { ...d, name: d.name.trim() }
    if (isNew) s.steps.push(out); else s.steps[s.steps.findIndex((x) => x.id === step!.id)] = out
    commit(); onClose()
  }
  return (
    <Dialog open onClose={onClose} wide title={isNew ? 'Add SLA rule' : 'Edit SLA rule'}
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button onPress={save}>Save rule</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Step ID" value={d.id} onChange={(v) => patch({ id: v })} disabled={!isNew} />
        <Pick label="Team" value={d.group} onChange={(v) => patch({ group: v })} options={s.groups.map((g) => ({ v: g, l: g }))} />
        <TextInput className="sm:col-span-2" label="Task name" value={d.name} onChange={(v) => patch({ name: v })} placeholder="What has to be done" />

        <h3 className="font-serif text-lg sm:col-span-2">SLA clock</h3>
        <Pick label="Clock starts from" value={d.start.type} onChange={(v) => patch({ start: v === 'field' ? { type: 'field', field: dateOpts[0]?.v ?? '' } : v === 'step' ? { type: 'step', step: others[0]?.id ?? '' } : { type: 'none' } })}
          options={[{ v: 'none', l: 'No SLA (tracked only)' }, { v: 'field', l: 'A date field' }, { v: 'step', l: "Another step's completion" }]} />
        {d.start.type === 'field' && <Pick label="Date field" value={d.start.field} onChange={(v) => patch({ start: { type: 'field', field: v } })} options={dateOpts} />}
        {d.start.type === 'step' && <Pick label="Step" value={d.start.step} onChange={(v) => patch({ start: { type: 'step', step: v } })} options={others.map((x) => ({ v: x.id, l: `${x.id} · ${x.name.slice(0, 40)}` }))} />}
        <TextInput label="Days" type="number" value={d.days === null ? '' : String(d.days)} onChange={(v) => patch({ days: v === '' ? null : Number(v) })} />
        <Pick label="When" value={d.when} onChange={(v) => patch({ when: v as 'After' | 'Before' })} options={[{ v: 'After', l: 'After' }, { v: 'Before', l: 'Before' }]} />
        <Pick label="Counting" value={d.unit} onChange={(v) => patch({ unit: v as 'WD' | 'CD' })} options={[{ v: 'WD', l: 'Working days' }, { v: 'CD', l: 'Calendar days' }]} />

        <Check label="Switched on (switching it off later keeps it for leavers already created)" checked={d.active} onChange={(v) => patch({ active: v })} />

        <div className="rounded-2xl bg-default p-4 text-sm sm:col-span-2">
          <p><b>Rule reads:</b> {E.slaText(s, d)} · team {d.group}</p>
          {E.liveLeavers(s).length > 0 && <div className="mt-3 max-w-xs"><Pick label="Try it on" value={leaverId} onChange={setLeaverId} options={E.liveLeavers(s).map((l) => ({ v: l.id, l: l.values.name || l.id }))} /></div>}
          <p className="mt-2">{!r ? 'Add a leaver to preview.' : !r.applies ? 'Does not apply to this leaver.' : <>Due <b>{r.due ? fmt(r.due) : '—'}</b> · status <b>{r.status}</b>{r.delay ? ` · ${r.delay} d` : ''}</>}</p>
        </div>
        {err && <p className="text-sm text-danger sm:col-span-2" role="alert">{err}</p>}
      </div>
    </Dialog>
  )
}

/* ---------------- Reasons & groups ---------------- */
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
const hueOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
const TRASH = 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z'

function IconBtn({ label, d, onClick, disabled, danger }: { label: string; d: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid size-8 place-items-center rounded-full transition-colors disabled:opacity-30 ${danger ? 'text-danger hover:bg-danger/15' : 'text-muted hover:bg-foreground/10 hover:text-foreground'}`}>
      <Icon d={d} />
    </button>
  )
}

function Badge({ text, hue }: { text: string; hue: number }) {
  return <span className="grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-semibold" aria-hidden="true"
    style={{ background: `oklch(90% 0.07 ${hue})`, color: `oklch(35% 0.1 ${hue})` }}>{text}</span>
}

function AddBox({ placeholder, onAdd, off, label }: { label: string; placeholder: string; onAdd: (name: string) => string | null; off: boolean }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const add = () => { const e = onAdd(v.trim()); if (e) setErr(e); else { setV(''); setErr('') } }
  return (
    <form className="mb-3" onSubmit={(e) => { e.preventDefault(); add() }}>
      <div className="panel flex items-center gap-2 rounded-full p-1.5 pl-4">
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-accent" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" /></svg>
        <TextField value={v} onChange={(x) => { setV(x); setErr('') }} isDisabled={off} aria-label={label} className="ghost-input min-w-0 flex-1"><Input className="w-full min-w-0 truncate" placeholder={placeholder} /></TextField>
        <Button type="submit" size="sm" className="shrink-0 rounded-full" isDisabled={off || !v.trim()}>Add</Button>
      </div>
      {err && <p role="alert" className="mt-1.5 pl-4 text-sm text-danger">{err}</p>}
    </form>
  )
}

const MORE = 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'

/** One "more" button instead of three icons on every row: move up, move down, delete. */
function RowMenu({ name, i, n, off, onMove, onDelete }: { name: string; i: number; n: number; off: boolean; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  return (
    <Dropdown>
      <Dropdown.Trigger aria-label={`More for ${name}`} isDisabled={off}
        className="grid size-8 place-items-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground disabled:opacity-30"><Icon d={MORE} /></Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label={`Actions for ${name}`} disabledKeys={[...(i === 0 ? ['up'] : []), ...(i === n - 1 ? ['down'] : [])]}
          onAction={(k) => { if (k === 'up') onMove(-1); else if (k === 'down') onMove(1); else if (k === 'delete') onDelete() }}>
          <Dropdown.Item id="up" textValue="Move up">Move up</Dropdown.Item>
          <Dropdown.Item id="down" textValue="Move down">Move down</Dropdown.Item>
          <Dropdown.Item id="delete" textValue="Delete" className="text-danger">Delete…</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

/** Two tabs, one job each: why people leave, and who does the work. */
function Lists() {
  return <Pair items={[['reasons', 'Termination reasons', <ReasonsPanel key="r" />], ['teams', 'Teams & members', <TeamsPanel key="t" />]]} />
}

function ReasonsPanel() {
  const s = useApp()
  const off = !canEdit('reasons')
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)
  const use = E.usage(s)
  const nextReasonId = () => { let n = s.reasons.length + 1; while (s.reasons.some((r) => r.id === 'R' + String(n).padStart(2, '0'))) n++; return 'R' + String(n).padStart(2, '0') }
  return (
    <section aria-label="Termination reasons">
      <BoxBar id="reasons" />
      <p className="mb-4 text-sm text-muted">Why someone is leaving. Every leaver gets every SLA rule. Turn on <b>Notice check</b> for reasons where the notice period should be verified.</p>
      <AddBox label="New reason" placeholder="Add a reason, e.g. End of internship" off={off}
        onAdd={(name) => {
          if (!name) return 'Type a name first.'
          if (s.reasons.some((r) => r.name.toLowerCase() === name.toLowerCase())) return 'That reason already exists.'
          s.reasons.push({ id: nextReasonId(), name, notice: false }); commit(); return null
        }} />
      <ul className="grid gap-2 xl:grid-cols-2">
        {s.reasons.map((x, i) => {
          const people = use.reason(x.id).length
          return (
            <li key={x.id} className="panel flex items-center gap-3 rounded-2xl p-2.5 pr-3">
              <div className="min-w-0 flex-1">
                <Draft plain label={`Name of reason ${x.id}`} value={x.name} disabled={off} onCommit={(v) => { x.name = v.trim() || x.name; commit() }} />
                <p className="pl-3 text-xs text-muted">{plural(people, 'leaver')}</p>
              </div>
              <Toggle on={x.notice} disabled={off} label={`Check notice period for ${x.name}`} onChange={(v) => { x.notice = v; commit() }}><span className="text-sm text-muted max-sm:hidden">Notice check</span></Toggle>
              <RowMenu name={x.name} i={i} n={s.reasons.length} off={off} onMove={(d) => move(s.reasons, i, d)} onDelete={() => {
                const used = use.reason(x.id)
                if (used.length) return setInfo({ title: 'This reason is in use', text: `${plural(used.length, 'leaver')} still ${used.length === 1 ? 'has' : 'have'} this reason: ${used.join(', ')}. Change them first.` })
                s.reasons = s.reasons.filter((r) => r.id !== x.id)
                s.steps.forEach((st) => { st.applies.reasons = st.applies.reasons.filter((y) => y !== x.id) })
                s.fields.forEach((f) => { f.requiredFor = (f.requiredFor || []).filter((y) => y !== x.id) })
                commit()
              }} />
            </li>
          )
        })}
      </ul>
      <Confirm open={!!info} title={info?.title ?? ''} text={info?.text} onClose={() => setInfo(null)} />
    </section>
  )
}

/** List of teams on the left; the chosen team's name and members on the right. */
function TeamsPanel() {
  const s = useApp()
  const off = !canEdit('teams')
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)
  const use = E.usage(s)
  const [pick, setPick] = useState(s.groups[0] ?? '')
  const g = s.groups.includes(pick) ? pick : s.groups[0]
  const i = g ? s.groups.indexOf(g) : -1
  const rules = g ? use.group(g).length : 0
  return (
    <>
      <BoxBar id="teams" />
    <section aria-label="Teams and members" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <AddBox label="New team" placeholder="New team name" off={off}
          onAdd={(name) => {
            if (!name) return 'Type a name first.'
            if (s.groups.some((x) => x.toLowerCase() === name.toLowerCase())) return 'That team already exists.'
            s.groups.push(name); commit(); setPick(name); return null
          }} />
        <div className="mb-1 lg:hidden"><Pick label="Team" value={g ?? ""} onChange={setPick} options={s.groups.map((t) => ({ v: t, l: `${t} (${membersOf(s, t).length})` }))} /></div>
        <ul className="grid gap-1.5 max-lg:hidden" aria-label="Teams">
          {s.groups.map((t) => (
            <li key={t}>
              <button type="button" aria-current={t === g ? 'true' : undefined} onClick={() => setPick(t)}
                className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors ${t === g ? 'bg-accent/12 ring-1 ring-accent/40' : 'hover:bg-foreground/5'}`}>
                <Badge text={t.slice(0, 2).toUpperCase()} hue={hueOf(t)} />
                <span className="min-w-0 flex-1"><b className="block truncate">{t}</b><span className="text-xs text-muted">{plural(membersOf(s, t).length, 'member')}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {g ? (
        <div className="panel min-w-0 rounded-3xl p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Draft key={g} plain label={`Team name ${g}`} value={g} disabled={off} onCommit={(v) => {
                const name = v.trim()
                if (!name || name === g) return
                if (s.groups.some((x) => x.toLowerCase() === name.toLowerCase() && x !== g)) return setInfo({ title: 'Name already taken', text: `"${name}" is already used by another team.` })
                s.groups[i] = name; s.steps.forEach((st) => { if (st.group === g) st.group = name }); if (s.members?.[g]) { s.members[name] = s.members[g]; delete s.members[g] }; teamChanged(g, name); setPick(name); commit()
              }} />
              <p className="pl-3 text-xs text-muted">Does the work of {plural(rules, 'rule')}. Renaming updates its rules.</p>
            </div>
            <RowMenu name={g} i={i} n={s.groups.length} off={off} onMove={(d) => move(s.groups, i, d)} onDelete={() => {
              if (rules) return setInfo({ title: 'This team owns steps', text: `${plural(rules, 'rule')} still ${rules === 1 ? 'belongs' : 'belong'} to ${g}: ${use.group(g).join(', ')}. Give them to another team first.` })
              teamChanged(g, null); s.groups.splice(i, 1); if (s.members) delete s.members[g]; commit()
            }} />
          </div>
          <h3 className="mb-1 font-serif text-lg">Members</h3>
          <p className="mb-4 text-sm text-muted">The people you can pick as "Done by" on this team's tasks.</p>
          <Members team={g} off={off} />
        </div>
      ) : <p className="rounded-2xl bg-foreground/5 p-4 text-sm text-muted">No teams yet. Add the first one.</p>}
      <Confirm open={!!info} title={info?.title ?? ''} text={info?.text} onClose={() => setInfo(null)} />
    </section>
    </>
  )
}

/* ---------------- Data ---------------- */
function Data() {
  return <Suspense fallback={null}><DatabaseCopy /></Suspense>
}
