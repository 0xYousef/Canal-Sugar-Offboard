import { useRef, useState } from 'react'
import { Button, Card } from '@heroui/react'
import { toast } from '@heroui/react'
import { commit, replaceState, state } from '../../lib/store'
import { can, hasExtra } from '../../lib/rbac'
import { log } from '../../lib/audit'
import { removeDemoLeavers } from '../../lib/start'
import { afterClose, noteSheet, useLive } from '../../lib/live'

const isAdmin = () => can('settings', 'edit')
import { autoMap, buildPreview, downloadTemplate, parseFile, exportImportReport, replacePlan, runImport, type ImportMode, type Table } from '../../lib/importer'
import { DataTable, Dialog, Pick, SectionTitle } from '../../ui/kit'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/* ---------------- read a file ---------------- */
interface Fetched { name: string; blob: Blob }

function ColChip({ label, state: st, req }: { label: string; state: 'idle' | 'ok' | 'missing'; req?: boolean }) {
  const tone = st === 'ok' ? 'bg-success/15 text-success' : st === 'missing' ? (req ? 'bg-danger/15 text-danger' : 'bg-foreground/10 text-muted') : 'bg-foreground/10'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{st === 'ok' ? '✓ ' : st === 'missing' && req ? '✕ ' : ''}{label}</span>
}

export function Reader({ onDone, first }: { onDone?: () => void; first?: boolean }) {
  const live = useLive()
  const closed = afterClose(live, state.settings)
  const off = !(can('leavers', 'edit') || isAdmin() || hasExtra('import')) || closed
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<Fetched | null>(null)
  const [table, setTable] = useState<Table | null>(null)
  const [backup, setBackup] = useState<unknown>(null)
  const [map, setMap] = useState<Record<number, string>>({})
  const [mode, setMode] = useState<ImportMode>('append')
  const [confirming, setConfirming] = useState(false)
  const pick = useRef<HTMLInputElement>(null)

  const load = async (f: Fetched) => {
    const parsed = await parseFile(f.name, f.blob)
    setFile(f)
    if (parsed.kind === 'backup') { setBackup(parsed.data); setTable(null); return }
    setBackup(null); setTable(parsed.table); setMap(autoMap(state, parsed.table.headers))
  }
  const onLocal = async (f?: File) => {
    if (!f) return
    setBusy(true)
    try { await load({ name: f.name, blob: f }) } catch (e) { toast.danger(msg(e)) }
    setBusy(false)
  }

  const preview = table ? buildPreview(state, table, map) : []
  const plan = mode === 'replace' && table ? replacePlan(state, preview) : null
  const hasId = Object.values(map).includes('empId')
  const bad = preview.filter((r) => r.errors.length).length
  const fieldOpts = [{ v: '', l: '— skip this column —' }, ...state.fields.map((f) => ({ v: f.key, l: f.label }))]

  /** Once a file is loaded, show which fields found a column. Before that, nothing is ticked. */
  const colState = (key: string): 'idle' | 'ok' | 'missing' => !table ? 'idle' : Object.values(map).includes(key) ? 'ok' : 'missing'
  const doImport = async () => {
    if (first) removeDemoLeavers()
    const r = runImport(state, preview, mode)
    log(mode === 'replace' ? 'Leavers replaced' : 'Leavers imported', `From ${file?.name ?? 'a file'}: ${r.added} added, ${r.existing} already existed${mode === 'replace' ? ' (updated)' : ' (unchanged)'}, ${r.removed} removed, ${r.skipped} skipped.`)
    commit()
    if (file) noteSheet(file.name)
    toast.success(`${mode === 'replace' ? 'Replaced' : 'Imported'}: ${r.added} added, ${r.existing} already existed, ${r.removed} removed, ${r.skipped} skipped`)
    const name = file?.name ?? 'file'
    void exportImportReport(state, r.addedRows, r.existingRows, name).catch((e) => toast.danger(msg(e)))
    setConfirming(false); setTable(null); setFile(null)
    onDone?.()
  }

  return (
    <>
      {!first && <SectionTitle title="Read a File" aside="CSV, Excel (.xlsx) or JSON" />}
      {closed && <p role="status" className="mb-3 rounded-2xl bg-warning/10 px-4 py-3 text-sm">The working day ended at <b>{live.endTime}</b>. Importing is closed until tomorrow.</p>}
      <Card>
        <Card.Content className="gap-4">
          <div className="rounded-2xl bg-foreground/5 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>Columns your file needs</b>
              <Button size="sm" variant="secondary" onPress={() => void downloadTemplate(state).catch((e) => toast.danger(msg(e)))}>Download Excel template</Button>
            </div>
            <p className="mt-1 text-muted">Column names must match the field names below (or you match them by hand after loading). A row missing a required column is skipped. <b>Employee ID</b> identifies each person and must be unique.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Required</p>
                <div className="flex flex-wrap gap-1.5">{state.fields.filter((f) => f.required || f.key === 'empId').map((f) => <ColChip key={f.key} label={f.label} state={colState(f.key)} req />)}</div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Optional</p>
                <div className="flex flex-wrap gap-1.5">{state.fields.filter((f) => !f.required && f.key !== 'empId').map((f) => <ColChip key={f.key} label={f.requiredFor?.length ? `${f.label} (by reason)` : f.label} state={colState(f.key)} />)}</div>
              </div>
            </div>
          </div>
          <input ref={pick} type="file" hidden accept=".csv,.xlsx,.json,text/csv" onChange={(e) => { void onLocal(e.target.files?.[0]); e.target.value = '' }} />
          <div role="button" tabIndex={0} aria-label="Choose a file, or drop it here" aria-disabled={off}
            onClick={() => !off && pick.current?.click()} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !off) { e.preventDefault(); pick.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); if (!off) setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (!off) void onLocal(e.dataTransfer.files?.[0]) }}
            className={`grid cursor-pointer place-items-center gap-1 rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-colors ${over ? 'border-accent bg-accent/10' : 'border-separator hover:border-accent/60 hover:bg-foreground/5'} ${off ? 'pointer-events-none opacity-60' : ''}`}>
            <svg viewBox="0 0 24 24" className="size-8 text-accent" fill="currentColor" aria-hidden="true"><path d="M19.4 10a7.5 7.5 0 0 0-14.3-2A5.5 5.5 0 0 0 6 19h4v-2.2H6a3.3 3.3 0 0 1-.3-6.6l1-.1.3-1a5.3 5.3 0 0 1 10.2 1l.2 1.3 1.3.2A2.7 2.7 0 0 1 18 16.8h-4V19h4a4.9 4.9 0 0 0 1.4-9ZM13 11h-2v3.2L9.4 12.6 8 14l4 4 4-4-1.4-1.4L13 14.2V11Z" /></svg>
            <b>{busy ? 'Reading the file…' : 'Choose a file, or drop it here'}</b>
            <span className="text-sm text-muted">.csv, .xlsx or .json. Nothing is uploaded anywhere; it is read in your browser.</span>
          </div>

          {file && <p className="text-sm text-muted">Loaded <b className="text-foreground">{file.name}</b> ({Math.max(1, Math.round(file.blob.size / 1024))} KB)</p>}

          {backup != null && (
            <div className="rounded-2xl bg-warning/10 p-4 text-sm">
              <p className="mb-3">This file is a full app backup. Restoring it <b>replaces all leavers, fields, rules and settings</b>.</p>
              <Button variant="danger" onPress={() => { try { replaceState(backup); log('Data restored', `Everything was replaced from ${file?.name ?? 'a backup'}.`); toast.success('Backup restored'); setBackup(null); setFile(null); onDone?.() } catch (e) { toast.danger(msg(e)) } }}>Replace everything with this backup</Button>
            </div>
          )}

          {table && (
            <>
              <div>
                <h3 className="mb-2 font-serif text-lg">Match Columns to Fields</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {table.headers.map((h, i) => (
                    <Pick key={i} label={`Column “${h || i + 1}”`} value={map[i] ?? ''}
                      onChange={(v) => setMap((m) => { const n = { ...m }; if (v) n[i] = v; else delete n[i]; return n })} options={fieldOpts} />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-serif text-lg">Preview <span className="text-sm font-normal text-muted">({preview.length} rows{bad ? `, ${bad} with problems will be skipped` : ''})</span></h3>
                <DataTable label="Import preview"
                  cols={[{ key: 'm', label: 'Result' }, { key: 'n', label: 'Name' }, { key: 'i', label: 'Employee ID' }, { key: 'e', label: 'Notes' }]}
                  rows={preview.slice(0, 50).map((r, i) => ({
                    id: String(i),
                    cells: [r.errors.length ? 'Skipped' : r.match === 'update' ? (mode === 'replace' ? 'Replace (keeps progress)' : 'Already exists, kept') : 'New', r.values.name ?? '—', r.values.empId ?? '—', <span key="e" className="text-sm text-danger">{r.errors.join('; ')}</span>],
                  }))} />
                {preview.length > 50 && <p className="mt-1 text-sm text-muted">Showing the first 50 rows. All {preview.length} will be imported.</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Pick label="This file should" value={mode} onChange={(v) => setMode(v as ImportMode)} options={[
                  { v: 'append', l: 'Append: add only new employees, keep existing ones' },
                  { v: 'replace', l: 'Replace: the file becomes the full list' },
                ]} />
                <Button variant={mode === 'replace' ? 'danger' : 'primary'} isDisabled={off || !preview.length || !map || !Object.values(map).includes('empId')} onPress={() => (mode === 'replace' ? setConfirming(true) : doImport())}>
                  {mode === 'replace' ? 'Replace with' : 'Import'} {preview.filter((r) => !r.errors.length).length} rows
                </Button>
              </div>
              <Dialog open={confirming} onClose={() => setConfirming(false)} title="Replace the current list?"
                footer={<><Button variant="tertiary" onPress={() => setConfirming(false)}>Cancel</Button><Button variant="danger" onPress={doImport}>Yes, replace</Button></>}>
                {plan && (
                  <div className="grid gap-3 text-sm">
                    <p>Leavers are compared by <b>Employee ID</b>{hasId ? '' : '. No column is matched to it yet, so every row will be skipped'}.</p>
                    <ul className="list-disc pl-5">
                      <li><b>{plan.matched}</b> already in the portal and in this file: updated, their task progress is kept.</li>
                      <li><b>{plan.added}</b> new in this file: added.</li>
                      <li className={plan.removed.length ? 'text-danger' : ''}><b>{plan.removed.length}</b> in the portal but not in this file: <b>deleted with their task history</b>.</li>
                    </ul>
                    {plan.removed.length > 0 && (
                      <p className="rounded-2xl bg-danger/10 p-3">
                        Will be deleted: {plan.removed.slice(0, 8).map((l) => l.values.empId || l.values.name || l.id).join(', ')}{plan.removed.length > 8 ? ` and ${plan.removed.length - 8} more` : ''}.
                      </p>
                    )}
                    <p className="text-muted">This cannot be undone.</p>
                  </div>
                )}
              </Dialog>
              {!Object.values(map).includes('empId') && <p className="text-sm text-warning">Match one column to “Employee ID” to enable import.</p>}
            </>
          )}
        </Card.Content>
      </Card>
    </>
  )
}

export default function Sources() {
  return (
    <>
      <p className="mb-2 max-w-2xl text-sm text-muted">
        Bring leavers in from a spreadsheet instead of typing each one. Choose the file, check that the columns match, then import.
      </p>
      <Reader />
    </>
  )
}
