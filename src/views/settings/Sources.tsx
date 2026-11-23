import { useRef, useState } from 'react'
import { Button, Card } from '@heroui/react'
import { toast } from '@heroui/react'
import { commit, replaceState, state } from '../../lib/store'
import { can } from '../../lib/rbac'
import { log } from '../../lib/audit'
import { removeDemoLeavers } from '../../lib/start'
import { noteSheet } from '../../lib/live'

const isAdmin = () => can('settings', 'edit')
import { autoMap, buildPreview, parseFile, runImport, type Table } from '../../lib/importer'
import { Check, DataTable, Pick, SectionTitle } from '../../ui/kit'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/* ---------------- read a file ---------------- */
interface Fetched { name: string; blob: Blob }

export function Reader({ onDone, first }: { onDone?: () => void; first?: boolean }) {
  const off = !(can('leavers', 'edit') || isAdmin())
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<Fetched | null>(null)
  const [table, setTable] = useState<Table | null>(null)
  const [backup, setBackup] = useState<unknown>(null)
  const [map, setMap] = useState<Record<number, string>>({})
  const [update, setUpdate] = useState(true)
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
  const bad = preview.filter((r) => r.errors.length).length
  const fieldOpts = [{ v: '', l: '— skip this column —' }, ...state.fields.map((f) => ({ v: f.key, l: f.label }))]

  const doImport = () => {
    if (first) removeDemoLeavers()
    const r = runImport(state, preview, update)
    log('Leavers imported', `From ${file?.name ?? 'a file'}: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped.`)
    commit()
    if (file) noteSheet(file.name)
    toast.success(`Imported: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped`)
    setTable(null); setFile(null)
    onDone?.()
  }

  return (
    <>
      {!first && <SectionTitle title="Read a file" aside="CSV, Excel (.xlsx) or JSON" />}
      <Card>
        <Card.Content className="gap-4">
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
                <h3 className="mb-2 font-serif text-lg">Match columns to fields</h3>
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
                    cells: [r.errors.length ? 'Skipped' : r.match === 'update' ? (update ? 'Update' : 'Exists, skipped') : 'New', r.values.name ?? '—', r.values.empId ?? '—', <span key="e" className="text-sm text-danger">{r.errors.join('; ')}</span>],
                  }))} />
                {preview.length > 50 && <p className="mt-1 text-sm text-muted">Showing the first 50 rows. All {preview.length} will be imported.</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Check label="Update leavers that already exist (matched by Employee ID, else by name)" checked={update} onChange={setUpdate} />
                <Button isDisabled={off || !preview.length || !map || !Object.values(map).includes('name')} onPress={doImport}>Import {preview.filter((r) => !r.errors.length).length} rows</Button>
              </div>
              {!Object.values(map).includes('name') && <p className="text-sm text-warning">Match one column to “Employee name” to enable import.</p>}
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
