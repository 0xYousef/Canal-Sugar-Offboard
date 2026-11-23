import { useState } from 'react'
import { Button, Dropdown, toast } from '@heroui/react'
import { localToday } from '../lib/dates'
import { state } from '../lib/store'
import { canAct, type Module } from '../lib/rbac'
import { setTask } from '../lib/tasks'
import type { TaskRow } from '../lib/types'
import { fmt } from '../lib/dates'
import { Dialog, StatusChip, TextInput } from './kit'

/**
 * One clear "Take action" button beside the status. It opens a list: Done,
 * Waive, Block, Reopen. Done asks for the date (today pre-filled). Urgent tasks get a filled button so they stand out; finished ones a quiet "Change".
 */
/** Asks when a task was finished. Today is filled in, so the usual case is one click. */
export function DoneDialog({ row, onClose, mod = 'tasks' }: { row: TaskRow; onClose: () => void; mod?: Module }) {
  const { step, leaver } = row
  const rec = leaver.tasks[step.id]
  const [date, setDate] = useState(rec && rec.s === 'done' ? rec.d : localToday())
  const save = () => {
    setTask(leaver.id, step.id, { s: 'done', d: date }, state, mod)
    toast.success(`${step.id} marked done`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Mark as done"
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button isDisabled={!date} onPress={save}>Done</Button></>}>
      <p className="mb-1 text-sm font-medium">{leaver.values.name}</p>
      <p className="mb-4 text-sm text-muted">{step.name}</p>
      <TextInput label="Date finished" type="date" value={date} onChange={setDate} />
    </Dialog>
  )
}

/** The task's state, with the finish date under "Done". Its own column. */
export function TaskStatus({ row }: { row: TaskRow }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StatusChip text={row.status} />
      {row.status === 'Done' && row.done && <span className="text-xs text-muted">on {fmt(row.done)}</span>}
    </span>
  )
}

/** The "Take action" button, in a column of its own. Shows a dash when the role may not act. */
export function TaskAction({ row, mod = 'tasks' }: { row: TaskRow; mod?: Module }) {
  const { step, leaver } = row
  const rec = leaver.tasks[step.id]
  const [doing, setDoing] = useState(false)
  if (!canAct(mod, step.group)) return <span className="text-muted" title="Your role cannot take action here">&mdash;</span>
  const urgent = ['Overdue', 'Blocked', 'Due Soon'].includes(row.status)
  const finished = row.status === 'Done' || row.status === 'Waived'

  const act = (key: string | number) => {
    if (key === 'done') setDoing(true)
    else if (key === 'waive') setTask(leaver.id, step.id, { s: 'waived' }, state, mod)
    else if (key === 'block') setTask(leaver.id, step.id, { s: 'blocked' }, state, mod)
    else if (key === 'reopen') setTask(leaver.id, step.id, null, state, mod)
  }

  return (
    <>
      <Dropdown>
        <Dropdown.Trigger aria-label={`Change ${step.id}: now ${row.status}`}
          className={`inline-flex h-8 min-w-0 w-auto flex-row flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold ${urgent ? 'bg-accent text-accent-foreground shadow-md' : 'border border-accent/40 bg-transparent text-accent'}`}>
          {finished ? 'Change' : 'Take action'}
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor" aria-hidden="true"><path d="m7 10 5 5 5-5H7Z" /></svg>
        </Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu aria-label={`Actions for ${step.id}`} onAction={act}>
            <Dropdown.Item id="done" textValue="Done">Done…</Dropdown.Item>
            <Dropdown.Item id="waive" textValue="Waive">Waive: does not apply</Dropdown.Item>
            <Dropdown.Item id="block" textValue="Block">Block: something is holding it up</Dropdown.Item>
            {rec ? <Dropdown.Item id="reopen" textValue="Reopen">Reopen</Dropdown.Item> : null}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {doing && <DoneDialog row={row} mod={mod} onClose={() => setDoing(false)} />}
    </>
  )
}
