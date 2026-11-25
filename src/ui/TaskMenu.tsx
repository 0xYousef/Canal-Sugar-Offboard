import { useState } from 'react'
import { who } from '../lib/engine'
import { Button, Dropdown, toast } from '@heroui/react'
import { localToday } from '../lib/dates'
import { state } from '../lib/store'
import { canAct, type Module } from '../lib/rbac'
import { actionStates, doAction, membersOf, missingAnswers, recordFor, setTask, waitingFor, type Answers } from '../lib/tasks'
import { asksAnything, flowOf, primaryDone } from '../lib/workflow'
import { REOPEN } from '../lib/flowDefaults'
import type { Member, Need, StepAction, TaskRow, WorkflowAction } from '../lib/types'
import { fmt } from '../lib/dates'
import { Dialog, LongText, Pick, StatusChip, TextInput } from './kit'

/**
 * One clear "Take action" button beside the status. It opens a list: Done,
 * Waive, Block, Reopen. Done asks for the date (today pre-filled). Urgent tasks get a filled button so they stand out; finished ones a quiet "Change".
 */
/** The questions a built-in action asks (date, team member, comment), as configured under Settings, Workflow. Shared by the task menu and bulk actions. */
export function WorkflowFields({ w, team, a, set }: { w: WorkflowAction; team: string | null; a: Answers; set: (p: Partial<Answers>) => void }) {
  const req = (n: Need) => (n === 'required' ? ' (required)' : '')
  const people = team ? membersOf(state, team) : []
  return (
    <div className="grid gap-3">
      {w.date !== 'off' && <TextInput label={`Date${req(w.date)}`} type="date" value={a.date} onChange={(v) => set({ date: v })} />}
      {w.member !== 'off' && (team
        ? <DonePicker people={people} team={team} value={a.by} onChange={(v) => set({ by: v })} required={w.member === 'required'} label={`Team member${req(w.member)}`} />
        : <p className="text-sm text-muted">The selected tasks belong to several teams. Select tasks from one team to say who did them.</p>)}
      {w.comment !== 'off' && <LongText label={`Comment${req(w.comment)}`} value={a.note} onChange={(v) => set({ note: v })} rows={3} />}
    </div>
  )
}

/** Asks what the action is set to ask for. Today is filled in, so the usual case is one click. */
export function BuiltInDialog({ row, action: w, onClose, mod = 'tasks' }: { row: TaskRow; action: WorkflowAction; onClose: () => void; mod?: Module }) {
  const { step, leaver } = row
  const rec = leaver.tasks[step.id]
  const [a, setA] = useState<Answers>({ date: rec && rec.s === 'done' ? rec.d : localToday(), by: rec && rec.s === 'done' && rec.by ? rec.by : '', note: '' })
  const save = () => {
    setTask(leaver.id, step.id, recordFor(w, a, localToday()), state, mod, { note: a.note.trim(), via: w })
    toast.success(`${step.id}: ${w.label}`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={w.label}
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button isDisabled={missingAnswers(w, a)} onPress={save}>{w.label}</Button></>}>
      <p className="mb-1 text-sm font-medium">{who(leaver)}</p>
      <p className="mb-4 text-sm text-muted">{step.name}</p>
      <WorkflowFields w={w} team={step.group} a={a} set={(p) => setA((x) => ({ ...x, ...p }))} />
    </Dialog>
  )
}

/** Marks a task done, asking for what Done is set to ask for. */
export const DoneDialog = (p: { row: TaskRow; onClose: () => void; mod?: Module }) => <BuiltInDialog action={primaryDone(state)} {...p} />

/** The task's state, with the finish date under "Done". Its own column. */
export function TaskStatus({ row }: { row: TaskRow }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StatusChip text={row.status} />
      {(() => { const r = row.leaver.tasks[row.step.id]; return r && r.s === 'acted' && row.status !== 'Done' ? <span className="text-xs text-muted" title={r.note}><b className="font-medium text-foreground">{r.act}</b> · on {fmt(r.d)}{r.by ? ` by ${r.by}` : ''}{r.note ? ' · has a comment' : ''}</span> : null })()}
      {row.status !== 'Done' && row.status !== 'Waived' && waitingFor(state, row.leaver, row.step).length > 0 && <span className="text-xs text-warning">Waiting for {waitingFor(state, row.leaver, row.step).join(', ')}</span>}
      {row.status !== 'Done' && row.status !== 'Waived' && actionStates(row.leaver, row.step).length > 0 && (() => { const st = actionStates(row.leaver, row.step); const left = st.filter((x) => !x.done).map((x) => x.action.name); return <span className="text-xs text-muted">{st.length - left.length} of {st.length} actions{left.length ? ` · left: ${left.join(', ')}` : ''}</span> })()}
      {row.status === 'Done' && row.done && (() => {
        const r = row.leaver.tasks[row.step.id]
        const d = r && r.s === 'done' ? r : null
        return <span className="text-xs text-muted" title={d?.note}>{d?.act ? <b className="font-medium text-foreground">{d.act} · </b> : null}on {fmt(row.done)}{d?.by ? ` by ${d.by}` : ''}{d?.note ? ' · has a comment' : ''}</span>
      })()}
    </span>
  )
}

const HEAD = 'pointer-events-none !opacity-100 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted'

/** What an action asks for, in a few words: "Needs date, comment · optional team member". */
function asksText(w: { date: Need; member: Need; comment: Need }) {
  const names: [string, Need][] = [['date', w.date], ['team member', w.member], ['comment', w.comment]]
  const need = names.filter(([, n]) => n === 'required').map(([t]) => t), opt = names.filter(([, n]) => n === 'optional').map(([t]) => t)
  return [need.length ? 'Needs ' + need.join(', ') : '', opt.length ? 'optional ' + opt.join(', ') : ''].filter(Boolean).join(' · ')
}

/** A menu row: a small marker, the action's name, and one quiet line under it. The marker is decoration, so screen readers read the name first. */
function Line({ main, sub, mark, done }: { main: string; sub?: string; mark: string; done?: boolean }) {
  return (
    <span className="flex items-start gap-2.5 py-0.5">
      <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${done ? 'bg-success/20 text-success' : 'bg-foreground/10 text-muted'}`}>{mark}</span>
      <span className="grid min-w-0"><span className="font-medium leading-snug">{main}</span>{sub ? <span className="text-xs leading-snug text-muted">{sub}</span> : null}</span>
    </span>
  )
}

/** The "Take action" button, in a column of its own. Shows a dash when the role may not act. */
export function TaskAction({ row, mod = 'tasks' }: { row: TaskRow; mod?: Module }) {
  const { step, leaver } = row
  const rec = leaver.tasks[step.id]
  const [doing, setDoing] = useState<WorkflowAction | null>(null)
  const [acting, setActing] = useState<StepAction | null>(null)
  const states = actionStates(leaver, step)
  const actions = states.map((x) => x.action)
  const waiting = waitingFor(state, leaver, step)
  // The rule's own actions come first. Your configured actions (such as Done) stay available below them, so a task can always be finished directly. Reopen is the only built-in, and only once something is recorded.
  const flow = flowOf(state).filter((w) => !states.some((x) => x.action.ref === w.id || x.action.from === w.id))
  const canReopen = !!rec || states.some((x) => x.done)
  if (!canAct(mod, step.group)) return <span className="text-muted" title="Your role cannot take action here">&mdash;</span>
  const urgent = ['Overdue', 'Blocked', 'Due Soon'].includes(row.status)
  const finished = row.status === 'Done' || row.status === 'Waived'

  const act = (key: string | number) => {
    if (String(key).startsWith('act:')) return setActing(actions.find((a) => 'act:' + a.id === key) ?? null)
    if (key === 'reopen') return setTask(leaver.id, step.id, null, state, mod, { via: REOPEN })
    const w = flowOf(state).find((x) => 'wf:' + x.id === key)
    if (!w) return
    // Anything it asks for opens a small form; an action that asks nothing is applied straight away.
    if (asksAnything(w)) setDoing(w)
    else setTask(leaver.id, step.id, recordFor(w, { date: '', by: '', note: '' }, localToday()), state, mod, { via: w })
  }

  return (
    <>
      <Dropdown>
        <Dropdown.Trigger aria-label={`Change ${step.id}: now ${row.status}`}
          className={`inline-flex h-8 min-w-0 w-auto flex-row flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold ${urgent ? 'bg-accent text-accent-foreground shadow-md' : 'border border-accent/40 bg-transparent text-accent'}`}>
          {finished ? 'Change' : 'Take action'}
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor" aria-hidden="true"><path d="m7 10 5 5 5-5H7Z" /></svg>
        </Dropdown.Trigger>
        <Dropdown.Popover className="min-w-72">
          <Dropdown.Menu aria-label={`Actions for ${step.id}`} onAction={act}>
            {waiting.length ? <Dropdown.Item id="waiting" textValue="Waiting" isDisabled><Line main={`Waiting for ${waiting.join(', ')}`} sub="Another rule has to be done first for this leaver." mark="…" /></Dropdown.Item> : null}
            {!waiting.length && states.length ? <Dropdown.Item id="h-steps" textValue="Steps" isDisabled className={HEAD}>{`Steps for this rule · ${states.filter((x) => x.done).length} of ${states.length} done`}</Dropdown.Item> : null}
            {!waiting.length ? states.map((x, i) => {
              const locked = !x.done && x.waitingFor.length > 0
              return (
                <Dropdown.Item key={x.action.id} id={'act:' + x.action.id} textValue={x.action.name} isDisabled={!!x.done || locked}>
                  <Line main={x.action.name} mark={x.done ? '✓' : String(i + 1)} done={!!x.done}
                    sub={x.done && x.done.s !== 'off' && 'd' in x.done && x.done.d ? `Done ${fmt(x.done.d)}${'by' in x.done && x.done.by ? ' by ' + x.done.by : ''}` : locked ? `Do ${x.waitingFor.join(', ')} first` : asksText(x.action)} />
                </Dropdown.Item>
              )
            }) : null}
            {!waiting.length && states.length && flow.length ? <Dropdown.Item id="h-other" textValue="Other actions" isDisabled className={HEAD}>Or finish it directly</Dropdown.Item> : null}
            {(waiting.length ? [] : flow).map((w) => (
              <Dropdown.Item key={w.id} id={'wf:' + w.id} textValue={w.label}>
                <Line main={w.label} mark={w.finishes === false ? '•' : '✓'} sub={[w.finishes === false ? 'Records it, task stays open' : 'Finishes the task', asksText(w)].filter(Boolean).join(' · ')} />
              </Dropdown.Item>
            ))}
            {!waiting.length && !states.length && !flow.length ? <Dropdown.Item id="none" textValue="No actions yet" isDisabled>No actions yet. An admin adds them in Settings, Task Actions.</Dropdown.Item> : null}
            {canReopen ? <Dropdown.Item id="h-undo" textValue="Undo" isDisabled className={HEAD}>Undo</Dropdown.Item> : null}
            {canReopen ? <Dropdown.Item id="reopen" textValue="Reopen"><Line main="Reopen" mark="↺" sub="Clears what is recorded on this task" /></Dropdown.Item> : null}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {doing && <BuiltInDialog row={row} action={doing} mod={mod} onClose={() => setDoing(null)} />}
      {acting && <ActionDialog row={row} action={acting} mod={mod} onClose={() => setActing(null)} />}
    </>
  )
}

/** "Done by": the people of the team that owns the task. Hidden-with-a-hint when the team has nobody listed yet. */
export function DonePicker({ people, team, value, onChange, required, label }: { people: Member[]; team: string; value: string; onChange: (v: string) => void; required?: boolean; label?: string }) {
  if (!people.length) return <p className={`text-sm ${required ? 'text-warning' : 'text-muted'}`}>No members are listed for {team}. {required ? 'This action needs one: add them' : 'Add them'} in Settings, Reasons &amp; teams{required ? '' : ', to say who did it'}.</p>
  const opts = [{ v: '__none', l: required ? 'Choose…' : 'Not specified' }, ...people.map((p) => ({ v: p.name, l: p.title ? `${p.name} · ${p.title}` : p.name })), ...(value && !people.some((p) => p.name === value) ? [{ v: value, l: value }] : [])]
  return <Pick label={label ?? `Done by (${team})`} value={value || '__none'} onChange={(v) => onChange(v === '__none' ? '' : v)} options={opts} />
}

/** One configured action: asks only for what the action needs (date, team member, comment) and holds back Save until the required ones are filled. */
export function ActionDialog({ row, action, onClose, mod = 'tasks' }: { row: TaskRow; action: StepAction; onClose: () => void; mod?: Module }) {
  const { step, leaver } = row
  const people = membersOf(state, step.group)
  const [date, setDate] = useState(localToday())
  const [by, setBy] = useState('')
  const [note, setNote] = useState('')
  const missing = (action.date === 'required' && !date) || (action.member === 'required' && !by) || (action.comment === 'required' && !note.trim())
  const save = () => {
    const e = doAction(leaver.id, step.id, action.id, {
      d: action.date !== 'off' && date ? date : localToday(),
      ...(action.member !== 'off' && by ? { by } : {}), ...(action.comment !== 'off' && note.trim() ? { note: note.trim() } : {}),
    }, state, mod)
    if (e) return toast.danger(e)
    toast.success(`${step.id}: ${action.name}`)
    onClose()
  }
  const req = (n: StepAction['date']) => (n === 'required' ? ' (required)' : '')
  return (
    <Dialog open onClose={onClose} title={action.name}
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button isDisabled={missing} onPress={save}>Save</Button></>}>
      <p className="mb-1 text-sm font-medium">{who(leaver)}</p>
      <p className="mb-4 text-sm text-muted">{step.name}</p>
      <div className="grid gap-3">
        {action.date !== 'off' && <TextInput label={`Date${req(action.date)}`} type="date" value={date} onChange={setDate} />}
        {action.member !== 'off' && (people.length
          ? <Pick label={`Team member${req(action.member)}`} value={by || '__none'} onChange={(v) => setBy(v === '__none' ? '' : v)}
              options={[{ v: '__none', l: action.member === 'required' ? 'Choose…' : 'Not specified' }, ...people.map((p) => ({ v: p.name, l: p.title ? `${p.name} · ${p.title}` : p.name }))]} />
          : <p className="text-sm text-warning">No members are listed for {step.group}.{action.member === 'required' ? ' Add them in Settings, Teams and members, before using this action.' : ''}</p>)}
        {action.comment !== 'off' && <LongText label={`Comment${req(action.comment)}`} value={note} onChange={setNote} rows={3} />}
      </div>
    </Dialog>
  )
}
