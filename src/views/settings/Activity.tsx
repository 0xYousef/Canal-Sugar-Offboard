import { useMemo, useState } from 'react'
import { Button, Card, toast } from '@heroui/react'
import { clearLog, exportXlsx, flush, pullLog, useAudit } from '../../lib/audit'
import { atlasReady } from '../../lib/atlas'
import { can, isOwner } from '../../lib/rbac'
import { addDays, localToday } from '../../lib/dates'
import { DataTable, Dialog, Pick, TextInput } from '../../ui/kit'

const ALL = '__all'
const PAGE = 100
/** Local calendar day (YYYY-MM-DD) of an entry, so "today" means the reader's today. */
const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function Activity() {
  const { entries, waiting, status } = useAudit()
  const [who, setWho] = useState(ALL)
  const [action, setAction] = useState(ALL)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [more, setMore] = useState(PAGE)
  const [busy, setBusy] = useState('')
  const [clearing, setClearing] = useState(false)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const people = useMemo(() => [...new Set(entries.map((e) => e.employee).filter(Boolean))].sort(), [entries])
  const actions = useMemo(() => [...new Set(entries.map((e) => e.action))].sort(), [entries])
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return entries.filter((e) => {
      const day = dayOf(e.at)
      return (who === ALL || e.employee === who) && (action === ALL || e.action === action)
        && (!from || day >= from) && (!to || day <= to)
        && (!t || (e.agent + ' ' + e.details + ' ' + e.employee).toLowerCase().includes(t))
    })
  }, [entries, who, action, q, from, to])
  const range = (a: string, b: string) => { setFrom(a); setTo(b); setMore(PAGE) }
  const filtered = who !== ALL || action !== ALL || q || from || to

  const run = async (name: string, fn: () => Promise<string | null | void>, ok: string) => {
    setBusy(name)
    try { const e = await fn(); if (e) toast.danger(e); else toast.success(ok) } catch (e) { toast.danger(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  const doClear = async () => {
    setBusy('clear')
    const e = await clearLog(pw)
    setBusy('')
    if (e) return setErr(e)
    setClearing(false); setPw(''); setErr(''); toast.success('Activity log cleared')
  }
  const db = atlasReady()

  return (
    <>
      <Card className="mb-4">
        <Card.Content className="gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Pick label="Employee" value={who} onChange={(v) => { setWho(v); setMore(PAGE) }} options={[{ v: ALL, l: 'All employees' }, ...people.map((p) => ({ v: p, l: p }))]} />
            <Pick label="Action" value={action} onChange={(v) => { setAction(v); setMore(PAGE) }} options={[{ v: ALL, l: 'All actions' }, ...actions.map((a) => ({ v: a, l: a }))]} />
            <TextInput label="Search the description" value={q} onChange={(v) => { setQ(v); setMore(PAGE) }} placeholder="Name, step or word" />
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <TextInput label="From date" type="date" value={from} onChange={(v) => { setFrom(v); setMore(PAGE) }} />
            <TextInput label="To date" type="date" value={to} onChange={(v) => { setTo(v); setMore(PAGE) }} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onPress={() => range(localToday(), localToday())}>Today</Button>
              <Button size="sm" variant="secondary" onPress={() => range(addDays(localToday(), -6), localToday())}>Last 7 days</Button>
              <Button size="sm" variant="secondary" onPress={() => range(localToday().slice(0, 8) + '01', localToday())}>This month</Button>
              {filtered && <Button size="sm" variant="tertiary" onPress={() => { setWho(ALL); setAction(ALL); setQ(''); range('', '') }}>Clear filters</Button>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" role="status">
              {rows.length} of {entries.length} entries.{' '}
              {!db ? 'Saved in this browser only. Set up the database to keep a shared copy.' : status ? <span className="text-danger">Not sent to the database: {status}</span> : waiting ? `${waiting} waiting to be sent to the database.` : 'All sent to the database.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {db && <Button variant="secondary" isPending={busy === 'pull'} onPress={() => run('pull', async () => (await flush()) ?? (await pullLog()), 'Log is up to date')}>Sync with database</Button>}
              <Button variant="secondary" isPending={busy === 'xlsx'} isDisabled={!rows.length || !can('logs', 'action')} onPress={() => run('xlsx', () => exportXlsx(rows).then(() => null), 'Excel file downloaded')}>Export to Excel</Button>
              {isOwner() && <Button variant="danger-soft" isDisabled={!entries.length} onPress={() => { setPw(''); setErr(''); setClearing(true) }}>Clear all</Button>}
            </div>
          </div>
        </Card.Content>
      </Card>

      <DataTable label="Activity log"
        cols={[{ key: 'w', label: 'When' }, { key: 'a', label: 'Agent' }, { key: 'e', label: 'Employee' }, { key: 'x', label: 'Action' }, { key: 'd', label: 'What happened' }]}
        rows={rows.slice(0, more).map((e) => ({
          id: e.id,
          cells: [<span key="w" className="whitespace-nowrap text-sm">{when(e.at)}</span>,
            <div key="a"><div className="font-medium">{e.agent}</div><div className="text-xs text-muted">{e.agentEmail}</div></div>,
            e.employee || <span key="e" className="text-muted">—</span>, <b key="x" className="font-semibold">{e.action}</b>, <span key="d" className="text-sm">{e.details}</span>],
        }))} />
      {rows.length > more && <div className="mt-3 text-center"><Button variant="secondary" onPress={() => setMore(more + PAGE)}>Show {Math.min(PAGE, rows.length - more)} more</Button></div>}
      {!rows.length && <p className="mt-4 text-center text-sm text-muted">{entries.length ? 'No entries match these filters.' : 'Nothing has happened yet. Actions appear here as people work.'}</p>}

      <Dialog open={clearing} onClose={() => setClearing(false)} title="Clear the whole activity log?"
        footer={<><Button variant="tertiary" onPress={() => setClearing(false)}>Cancel</Button><Button variant="danger" isPending={busy === 'clear'} isDisabled={!pw} onPress={doClear}>Delete everything</Button></>}>
        <p className="mb-4 text-sm text-muted">
          This deletes all {entries.length} entries{db ? ' from this browser and from the MongoDB database' : ' from this browser'}. It cannot be undone. One new entry will record that you cleared it.
        </p>
        <TextInput label="Type your password to confirm" type="password" value={pw} onChange={(v) => { setPw(v); setErr('') }} />
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      </Dialog>
    </>
  )
}
