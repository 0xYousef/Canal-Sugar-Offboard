import { Suspense, lazy, useState, type ReactNode } from 'react'
import { Button, Card, Input, Tabs, TextField } from '@heroui/react'
import * as E from '../lib/engine'
import { fmt } from '../lib/dates'
import { FIELD_TYPES, SECTIONS, slugKey } from '../lib/fields'
import { commit, useApp } from '../lib/store'
import { can, isOwner, teamChanged, useRbac } from '../lib/rbac'

const isAdmin = () => can('settings', 'edit')
import type { Field, FieldType, Step } from '../lib/types'
import { atlasReady } from '../lib/atlas'
import { minutesToClose, removeSharedFile, saveLiveSettings, useLive } from '../lib/live'
import { toast } from '@heroui/react'
import { session } from '../lib/store'
import { Check, Confirm, Toggle, DataTable, Dialog, LongText, PageHead, Pick, TextInput } from '../ui/kit'

const Users = lazy(() => import('./settings/Users'))
const Sources = lazy(() => import('./settings/Sources'))
const Access = lazy(() => import('./settings/Access'))
const DatabaseCopy = lazy(() => import('./settings/DatabaseCopy'))
const Activity = lazy(() => import('./settings/Activity'))
type Topic = 'general' | 'fields' | 'lists' | 'sla' | 'people' | 'connect' | 'activity' | 'data'
const TOPICS: { id: Topic; title: string; text: string; owner?: boolean; advanced?: boolean }[] = [
  { id: 'general', title: 'Calendar and alerts', text: 'Weekend days, public holidays, and when a task counts as due soon.' },
  { id: 'fields', title: 'Leaver form', text: 'The questions asked when you add a leaver, such as department or dates.' },
  { id: 'lists', title: 'Reasons and teams', text: 'Why people leave, and the teams that own tasks.' },
  { id: 'sla', title: 'Deadlines', text: 'How many days each task is allowed to take.', advanced: true },
  { id: 'people', title: 'People and access', text: 'Who can sign in, and what each role may see, edit or take action on.', owner: true },
  { id: 'connect', title: 'Import leavers', text: 'Read a leaver list from a CSV, Excel or JSON file on this computer.' },
  { id: 'activity', title: 'Activity log', text: 'Who did what and to which employee. Filter it, export to Excel, or clear it.' },
  { id: 'data', title: 'Database', text: 'Connection status, and a shared copy of everything in MongoDB.', owner: true },
]

/** Two small screens in one topic, switched by a pair of tabs. */
function Pair({ items }: { items: [string, string, ReactNode][] }) {
  const [k, setK] = useState(items[0][0])
  const cur = items.find((x) => x[0] === k) ?? items[0]
  return (
    <>
      <Tabs selectedKey={cur[0]} onSelectionChange={(x) => setK(String(x))} className="mb-6">
        <Tabs.ListContainer><Tabs.List aria-label="Choose">{items.map(([id, label]) => <Tabs.Tab key={id} id={id}>{label}<Tabs.Indicator /></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
      </Tabs>
      <Suspense fallback={null}>{cur[2]}</Suspense>
    </>
  )
}

const move = <T,>(arr: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; commit() }
const sectionCard = (title: string, children: ReactNode, note?: string) => (
  <Card className="mb-4"><Card.Header><Card.Title>{title}</Card.Title>{note && <Card.Description>{note}</Card.Description>}</Card.Header><Card.Content>{children}</Card.Content></Card>
)

/** Text input that commits on blur, for names where every keystroke must not rewrite state. */
function Draft({ value, onCommit, label, disabled, plain }: { value: string; onCommit: (v: string) => void; label: string; disabled?: boolean; plain?: boolean }) {
  const [v, setV] = useState(value)
  return (
    <TextField value={v} onChange={setV} onBlur={() => onCommit(v)} isDisabled={disabled} aria-label={label} className={plain ? 'ghost-input' : undefined}>
      <Input />
    </TextField>
  )
}

export default function Settings() {
  useApp(); useRbac()
  const [topic, setTopic] = useState<Topic | null>(null)
  const list = TOPICS.filter((t) => (isOwner() || !t.owner) && (t.id === 'activity' ? can('logs', 'view') : can('settings', 'view')))
  const cur = list.find((t) => t.id === topic)
  const sub = isAdmin() ? 'Pick what you want to change. Changes apply to every leaver straight away.' : 'You can look at these settings but not change them.'

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
      <PageHead title={cur.title} sub={cur.text} onBack={() => setTopic(null)} />
      {cur.id === 'general' && <General />}
      {cur.id === 'fields' && <Fields />}
      {cur.id === 'lists' && <Lists />}
      {cur.id === 'sla' && <Sla />}
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
  const st = s.settings, n = st.notice, off = !isAdmin()
  const dateOpts = s.fields.filter((f) => f.type === 'date').map((f) => ({ v: f.key, l: f.label }))
  const [hd, setHd] = useState(''), [hn, setHn] = useState('')
  const numSet = (set: (v: number) => void) => (v: string) => { set(Number(v)); commit() }
  return (
    <>
      {sectionCard('Calendar and alerts', (
        <div className="grid gap-4 sm:grid-cols-3">
          <Pick label="Weekend" disabled={off} value={st.weekend} onChange={(v) => { st.weekend = v as 'FS' | 'SS'; commit() }} options={[{ v: 'FS', l: 'Friday + Saturday' }, { v: 'SS', l: 'Saturday + Sunday' }]} />
          <TextInput label="Due Soon window (days)" type="number" disabled={off} value={String(st.dueSoon)} onChange={numSet((v) => { st.dueSoon = v })} />
          <TextInput label="Report date override (optional)" type="date" disabled={off} value={st.reportDate} onChange={(v) => { st.reportDate = v; commit() }} />
        </div>
      ))}
      <WorkingDay />
      {sectionCard('Notice-period check', (
        <div className="grid gap-4 sm:grid-cols-3">
          <Pick label="Hire date field" disabled={off} value={n.hireField} onChange={(v) => { n.hireField = v; commit() }} options={dateOpts} />
          <Pick label="Request date field" disabled={off} value={n.requestField} onChange={(v) => { n.requestField = v; commit() }} options={dateOpts} />
          <Pick label="Leaving date field" disabled={off} value={n.endField} onChange={(v) => { n.endField = v; commit() }} options={dateOpts} />
          <TextInput label="Service threshold (years)" type="number" disabled={off} value={String(n.years)} onChange={numSet((v) => { n.years = v })} />
          <TextInput label="Months when service ≤ threshold" type="number" disabled={off} value={String(n.short)} onChange={numSet((v) => { n.short = v })} />
          <TextInput label="Months when service > threshold" type="number" disabled={off} value={String(n.long)} onChange={numSet((v) => { n.long = v })} />
        </div>
      ), 'Applies to reasons flagged "notice" in Reasons & groups. Choose which date fields it reads.')}
      {sectionCard('Holidays', (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <TextInput label="Date" type="date" disabled={off} value={hd} onChange={setHd} />
            <TextInput label="Holiday name" disabled={off} value={hn} onChange={setHn} />
            <Button variant="secondary" isDisabled={off || !hd} onPress={() => { st.holidays.push({ date: hd, name: hn || 'Holiday' }); setHd(''); setHn(''); commit() }}>Add holiday</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {st.holidays.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((h) => (
              <span key={h.date} className="inline-flex items-center gap-1.5 rounded-full bg-default px-3 py-1 text-sm">
                {fmt(h.date)} · {h.name}
                {!off && <button aria-label={`Remove ${h.name}`} className="text-muted hover:text-danger" onClick={() => { st.holidays = st.holidays.filter((x) => x.date !== h.date); commit() }}>×</button>}
              </span>
            ))}
          </div>
        </>
      ), 'Working-day (WD) rules skip these. Add Eids and Sham El-Nessim yourself.')}
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
  const left = minutesToClose(live)
  const run = async (f: () => Promise<void>, ok: string) => { setBusy(true); try { await f(); toast.success(ok) } catch (e) { toast.danger(e instanceof Error ? e.message : String(e)) } setBusy(false) }
  const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
  return sectionCard('End of the working day', !atlasReady() ? (
    <p className="text-sm text-muted">The shared sheet needs the database. Add <code>VITE_DB_URL</code> to the .env file first.</p>
  ) : (
    <div className="grid gap-4">
      <p className="text-sm">
        Everyone signed in works on the same sheet, and changes show on every screen within a few seconds.
        {live.sheet ? <> Today\u2019s file: <b>{live.sheet.name}</b>, loaded by {live.sheet.by}.</> : ' No file is loaded.'}
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <Toggle on={live.enabled} disabled={!can_ || busy} label="Remove the file from the server at closing time" onChange={(v) => void run(() => saveLiveSettings(v, t), v ? `The file will be removed at ${t} every day` : 'The file stays on the server')} />
        <TextInput label="Closing time" type="time" disabled={!can_} value={t} onChange={setTime} />
        <Button variant="secondary" isDisabled={!can_ || busy || t === live.endTime} onPress={() => void run(() => saveLiveSettings(live.enabled, t), 'Closing time saved')}>Save time</Button>
      </div>
      <p className="text-sm text-muted">
        Server time is {hh(live.nowMin + (Date.now() - live.readAt) / 60000)}.
        {live.enabled && left !== null && left > 0 ? ` The file will be removed in ${Math.round(left)} minutes.` : live.enabled ? ' The next removal is tomorrow at closing time.' : ''}
        {' '}People see a warning 30 minutes before, and the rules popup tells everyone.
      </p>
      <div><Button variant="danger" isDisabled={!can_ || busy} onPress={() => setAsk(true)}>Remove the file now</Button></div>
      <Confirm open={ask} title="Remove the shared file?" text="Every leaver and task on the server is deleted for everyone, right now. Export first if you need a copy." onClose={() => setAsk(false)} onOk={() => void run(removeSharedFile, 'The shared file was removed')} />
      {!can_ && <p className="text-sm text-muted">Only the Owner or an Admin can change this.</p>}
    </div>
  ))
}

/* ---------------- Fields ---------------- */
function Fields() {
  const s = useApp()
  const off = !isAdmin()
  const [edit, setEdit] = useState<{ f: Field | null } | null>(null)
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)
  const [del, setDel] = useState<string | null>(null)
  const use = E.usage(s)
  return (
    <>
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
        onOk={() => { s.fields = s.fields.filter((f) => f.key !== del); s.leavers.forEach((l) => delete l.values[del!]); setDel(null); commit() }} />
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

function Sla() {
  const s = useApp()
  const off = !isAdmin()
  const [edit, setEdit] = useState<{ step: Step | null } | null>(null)
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)
  const [del, setDel] = useState<string | null>(null)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">{s.steps.length} steps. A rule says who owns a step, which date starts its clock, how long they have, and when it applies.</p>
        <Button isDisabled={off} onPress={() => setEdit({ step: null })}>Add SLA rule</Button>
      </div>
      <DataTable label="SLA rules"
        cols={[{ key: 'i', label: 'ID' }, { key: 'on', label: 'On' }, { key: 't', label: 'Task' }, { key: 'o', label: 'Team' }, { key: 's', label: 'SLA' }, { key: 'ap', label: 'Applies' }, { key: 'a', label: '' }]}
        rows={s.steps.map((st, i) => ({
          id: st.id,
          cells: [
            <code key="i" className="text-xs">{st.id}</code>,
            <Toggle key="on" on={st.active} disabled={off} label={`Active ${st.id}`} onChange={(v) => { st.active = v; commit() }} />,
            st.name, st.group,
            <span key="s" className="text-sm text-muted">{E.slaText(s, st)}</span>,
            <span key="ap" className="text-sm text-muted">{(st.applies.mode === 'all' ? 'All reasons' : st.applies.reasons.length + ' reason(s)') + (st.condition?.field ? ' + condition' : '')}</span>,
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
      <Confirm open={!!del} title="Delete this rule?" text="Recorded completion dates for it are discarded." onClose={() => setDel(null)}
        onOk={() => { s.steps = s.steps.filter((x) => x.id !== del); s.leavers.forEach((l) => delete l.tasks[del!]); setDel(null); commit() }} />
    </>
  )
}

function StepForm({ step, onClose }: { step: Step | null; onClose: () => void }) {
  const s = useApp()
  const isNew = !step
  const [d, setD] = useState<Step>(() => step ? JSON.parse(JSON.stringify(step)) : {
    id: nextStepId(s), active: true, group: s.groups[0], name: '', start: { type: 'field', field: 'lwd' }, days: 0, when: 'After', unit: 'CD', applies: { mode: 'all', reasons: [] }, condition: null,
  })
  const [leaverId, setLeaverId] = useState(s.leavers[0]?.id ?? '')
  const [err, setErr] = useState('')
  const patch = (p: Partial<Step>) => setD((x) => ({ ...x, ...p }))
  const cond = d.condition ?? { field: '', op: 'eq' as const, value: '' }
  const dateOpts = s.fields.filter((f) => f.type === 'date').map((f) => ({ v: f.key, l: f.label }))
  const others = s.steps.filter((x) => x.id !== d.id)
  const lv = E.getLeaver(s, leaverId)
  const r = lv ? E.evalTask(s, lv, d) : null

  const save = () => {
    if (!d.id || !/^[A-Za-z0-9_-]+$/.test(d.id)) return setErr('Step ID can use letters, digits, - and _ only.')
    if (isNew && E.stepById(s, d.id)) return setErr(`Step ID "${d.id}" already exists.`)
    if (!d.name.trim()) return setErr('Give the task a name.')
    if (d.start.type !== 'none' && d.days === null) return setErr('Enter the number of days, or choose "No SLA".')
    if (d.start.type === 'field' && !d.start.field) return setErr('Add a date field first (Settings → Leaver form).')
    if (d.start.type === 'step' && (!d.start.step || d.start.step === d.id)) return setErr('Choose a different step to start from.')
    if (d.applies.mode === 'reasons' && !d.applies.reasons.length) return setErr('Tick at least one reason, or choose "All reasons".')
    const out = { ...d, name: d.name.trim() }
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

        <h3 className="font-serif text-lg sm:col-span-2">When it applies</h3>
        <Pick label="Reasons" value={d.applies.mode} onChange={(v) => patch({ applies: { ...d.applies, mode: v as 'all' | 'reasons' } })} options={[{ v: 'all', l: 'All reasons' }, { v: 'reasons', l: 'Only the reasons I tick' }]} />
        {d.applies.mode === 'reasons' && (
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            {s.reasons.map((x) => <Check key={x.id} label={x.name} checked={d.applies.reasons.includes(x.id)} onChange={(c) => patch({ applies: { ...d.applies, reasons: c ? [...d.applies.reasons, x.id] : d.applies.reasons.filter((y) => y !== x.id) } })} />)}
          </div>
        )}
        <Pick label="Extra condition on a field" value={cond.field || '__none'} onChange={(v) => patch({ condition: v === '__none' ? null : { ...cond, field: v } })}
          options={[{ v: '__none', l: 'No condition' }, ...s.fields.filter((f) => f.type !== 'textarea').map((f) => ({ v: f.key, l: f.label }))]} />
        {d.condition && <>
          <Pick label="Operator" value={cond.op} onChange={(v) => patch({ condition: { ...cond, op: v as typeof cond.op } })} options={[{ v: 'eq', l: 'equals' }, { v: 'neq', l: 'does not equal' }, { v: 'filled', l: 'is filled' }, { v: 'empty', l: 'is empty' }]} />
          <TextInput label="Value" value={cond.value ?? ''} onChange={(v) => patch({ condition: { ...cond, value: v } })} placeholder="e.g. Yes" />
        </>}
        <Check label="Active" checked={d.active} onChange={(v) => patch({ active: v })} />

        <div className="rounded-2xl bg-default p-4 text-sm sm:col-span-2">
          <p><b>Rule reads:</b> {E.slaText(s, d)} · team {d.group}</p>
          {s.leavers.length > 0 && <div className="mt-3 max-w-xs"><Pick label="Try it on" value={leaverId} onChange={setLeaverId} options={s.leavers.map((l) => ({ v: l.id, l: l.values.name || l.id }))} /></div>}
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
const UP = 'm7 14 5-5 5 5H7Z', DOWN = 'm7 10 5 5 5-5H7Z'
const TRASH = 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z'

function IconBtn({ label, d, onClick, disabled, danger }: { label: string; d: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid size-8 place-items-center rounded-full transition-colors disabled:opacity-30 ${danger ? 'text-danger hover:bg-danger/15' : 'text-muted hover:bg-foreground/10 hover:text-foreground'}`}>
      <Icon d={d} />
    </button>
  )
}

const Count = ({ children, tone }: { children: ReactNode; tone?: 'warn' }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone === 'warn' ? 'bg-warning/15 text-warning' : 'bg-foreground/8 text-muted'}`}>{children}</span>
)

function Badge({ text, hue }: { text: string; hue: number }) {
  return <span className="grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-semibold" aria-hidden="true"
    style={{ background: `oklch(90% 0.07 ${hue})`, color: `oklch(35% 0.1 ${hue})` }}>{text}</span>
}

function ListHead({ id, title, count, blurb }: { id: string; title: string; count: number; blurb: string }) {
  return (
    <header className="mb-4">
      <h2 id={id} className="flex items-center gap-3 text-2xl font-medium">{title}<span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-sans text-sm font-semibold text-accent">{count}</span></h2>
      <p className="mt-1 text-sm text-muted">{blurb}</p>
    </header>
  )
}

function AddBox({ placeholder, onAdd, off, label }: { label: string; placeholder: string; onAdd: (name: string) => string | null; off: boolean }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const add = () => { const e = onAdd(v.trim()); if (e) setErr(e); else { setV(''); setErr('') } }
  return (
    <form className="mb-3" onSubmit={(e) => { e.preventDefault(); add() }}>
      <div className="panel flex items-center gap-2 rounded-full p-1.5 pl-4">
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-accent" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" /></svg>
        <TextField value={v} onChange={(x) => { setV(x); setErr('') }} isDisabled={off} aria-label={label} className="ghost-input flex-1"><Input placeholder={placeholder} /></TextField>
        <Button type="submit" size="sm" className="rounded-full" isDisabled={off || !v.trim()}>Add</Button>
      </div>
      {err && <p role="alert" className="mt-1.5 pl-4 text-sm text-danger">{err}</p>}
    </form>
  )
}

function Lists() {
  const s = useApp()
  const off = !isAdmin()
  const use = E.usage(s)
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null)

  const rulesForReason = (id: string) => s.steps.filter((x) => x.applies.mode === 'reasons' && x.applies.reasons.includes(id)).length
  const allReasonRules = s.steps.filter((x) => x.applies.mode === 'all').length
  const nextReasonId = () => { let n = s.reasons.length + 1; while (s.reasons.some((r) => r.id === 'R' + String(n).padStart(2, '0'))) n++; return 'R' + String(n).padStart(2, '0') }

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section aria-labelledby="reasons-h">
        <ListHead id="reasons-h" title="Termination reasons" count={s.reasons.length}
          blurb={`Why someone is leaving. The reason decides which tasks they get. ${allReasonRules} rules apply to every reason; the rest only to the reasons they list.`} />
        <AddBox label="New reason" placeholder="Add a reason, e.g. End of internship" off={off}
          onAdd={(name) => {
            if (!name) return 'Type a name first.'
            if (s.reasons.some((r) => r.name.toLowerCase() === name.toLowerCase())) return 'That reason already exists.'
            s.reasons.push({ id: nextReasonId(), name, notice: false }); commit(); return null
          }} />
        <ul className="grid gap-2">
          {s.reasons.map((x, i) => {
            const people = use.reason(x.id).length, rules = rulesForReason(x.id)
            return (
              <li key={x.id} className="panel group rounded-2xl p-2.5 pr-3">
                <div className="flex items-center gap-3">
                  <Badge text={x.id.replace('R', '')} hue={hueOf(x.id)} />
                  <div className="min-w-0 flex-1">
                    <Draft plain label={`Name of reason ${x.id}`} value={x.name} disabled={off} onCommit={(v) => { x.name = v.trim() || x.name; commit() }} />
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-3">
                      <Count>{plural(people, 'leaver')}</Count>
                      <Count>{plural(rules, 'rule')} only here</Count>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Toggle on={x.notice} disabled={off} label={`Check notice period for ${x.name}`} onChange={(v) => { x.notice = v; commit() }}><span className="text-xs text-muted">Notice check</span></Toggle>
                    <div className="flex items-center">
                      <IconBtn label={`Move ${x.name} up`} d={UP} disabled={off || i === 0} onClick={() => move(s.reasons, i, -1)} />
                      <IconBtn label={`Move ${x.name} down`} d={DOWN} disabled={off || i === s.reasons.length - 1} onClick={() => move(s.reasons, i, 1)} />
                      <IconBtn danger label={`Delete ${x.name}`} d={TRASH} disabled={off} onClick={() => {
                        const used = use.reason(x.id)
                        if (used.length) return setInfo({ title: 'This reason is in use', text: `${plural(used.length, 'leaver')} still ${used.length === 1 ? 'has' : 'have'} this reason: ${used.join(', ')}. Change them first.` })
                        s.reasons = s.reasons.filter((r) => r.id !== x.id)
                        s.steps.forEach((st) => { st.applies.reasons = st.applies.reasons.filter((y) => y !== x.id) })
                        s.fields.forEach((f) => { f.requiredFor = (f.requiredFor || []).filter((y) => y !== x.id) })
                        commit()
                      }} />
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-sm text-muted">Notice check compares the notice an employee gave with what their length of service requires. Set the limits under General &amp; calendar.</p>
      </section>

      <section aria-labelledby="groups-h">
        <ListHead id="groups-h" title="Teams" count={s.groups.length}
          blurb="The teams that carry out each step, such as HR, IT or Legal." />
        <AddBox label="New group" placeholder="Add a group, e.g. Training" off={off}
          onAdd={(name) => {
            if (!name) return 'Type a name first.'
            if (s.groups.some((g) => g.toLowerCase() === name.toLowerCase())) return 'That group already exists.'
            s.groups.push(name); commit(); return null
          }} />
        <ul className="grid gap-2">
          {s.groups.map((g, i) => {
            const rules = use.group(g).length
            return (
              <li key={g + i} className="panel rounded-2xl p-2.5 pr-3">
                <div className="flex items-center gap-3">
                  <Badge text={g.slice(0, 2).toUpperCase()} hue={hueOf(g)} />
                  <div className="min-w-0 flex-1">
                    <Draft plain label={`Group ${g}`} value={g} disabled={off} onCommit={(v) => {
                      const name = v.trim()
                      if (!name || name === g) return
                      if (s.groups.some((x) => x.toLowerCase() === name.toLowerCase() && x !== g)) return setInfo({ title: 'Name already taken', text: `"${name}" is already used by another team.` })
                      s.groups[i] = name; s.steps.forEach((st) => { if (st.group === g) st.group = name }); teamChanged(g, name); commit()
                    }} />
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-3">
                      <Count>{plural(rules, 'rule')}</Count>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <IconBtn label={`Move ${g} up`} d={UP} disabled={off || i === 0} onClick={() => move(s.groups, i, -1)} />
                    <IconBtn label={`Move ${g} down`} d={DOWN} disabled={off || i === s.groups.length - 1} onClick={() => move(s.groups, i, 1)} />
                    <IconBtn danger label={`Delete ${g}`} d={TRASH} disabled={off} onClick={() => {
                      if (rules) return setInfo({ title: 'This group owns steps', text: `${plural(rules, 'rule')} still ${rules === 1 ? 'belongs' : 'belong'} to ${g}: ${use.group(g).join(', ')}. Give them to another group first.` })
                      teamChanged(g, null); s.groups.splice(i, 1); commit()
                    }} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-sm text-muted">Renaming a team updates its rules.</p>
      </section>
      <Confirm open={!!info} title={info?.title ?? ''} text={info?.text} onClose={() => setInfo(null)} />
    </div>
  )
}

/* ---------------- Data ---------------- */
function Data() {
  return <Suspense fallback={null}><DatabaseCopy /></Suspense>
}
