import { useState } from 'react'
import { Button, Card, Chip, toast } from '@heroui/react'
import { atlasReady, pullFromAtlas, pushToAtlas, useAtlasLast, useDbStatus } from '../../lib/atlas'
import { log } from '../../lib/audit'
import { can, isOwner } from '../../lib/rbac'
import { Confirm } from '../../ui/kit'

/** Status of the MongoDB link (set in .env) and a manual save/load of everything. */
export default function DatabaseCopy() {
  const last = useAtlasLast()
  const ready = atlasReady()
  const db = useDbStatus()
  const state = db.state === 'ok' || db.state === 'error' ? { ok: db.state === 'ok', text: db.text } : null
  const [busy, setBusy] = useState('')
  const [ask, setAsk] = useState(false)
  const may = isOwner() || can('settings', 'edit')
  const run = async (name: string, fn: () => Promise<void>, ok: string, note: string) => {
    setBusy(name)
    try { await fn(); log('Database sync', note); toast.success(ok) } catch (e) { toast.danger(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  return (
    <Card className="mb-4">
      <Card.Header className="flex-row items-center justify-between">
        <Card.Title>MongoDB database</Card.Title>
        <Chip size="sm" variant="soft" color={!ready ? 'default' : state?.ok ? 'success' : state ? 'danger' : 'default'}>
          <Chip.Label>{!ready ? 'Not set up' : state?.ok ? 'Connected' : state ? 'Problem' : 'Checking'}</Chip.Label>
        </Chip>
      </Card.Header>
      <Card.Content className="gap-3">
        {!ready ? (
          <p className="text-sm text-muted">The connection is set in the project's <code>.env</code> file (<code>VITE_DB_URL</code> and <code>VITE_DB_KEY</code>), then the app is rebuilt. Nothing to fill in here.</p>
        ) : (
          <>
            <p className={`text-sm ${state && !state.ok ? 'text-danger' : 'text-muted'}`} role="status">{state ? state.text : 'Checking the connection.'} The activity log is sent automatically.</p>
            <div className="flex flex-wrap gap-2">
              <Button isPending={busy === 'save'} isDisabled={!may || !state?.ok} onPress={() => run('save', pushToAtlas, 'Saved to the database', 'Saved everything to MongoDB.')}>Save to database</Button>
              <Button variant="secondary" isPending={busy === 'load'} isDisabled={!may || !state?.ok} onPress={() => setAsk(true)}>Load from database</Button>
            </div>
            <p className="text-sm text-muted">{last ? `${last.what} on ${new Date(last.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Nothing copied yet.'}</p>
          </>
        )}
      </Card.Content>
      <Confirm open={ask} title="Replace this browser's data?" text="Everything here (leavers, rules, settings) is replaced by the copy in the database. Save first if this browser has newer work."
        onClose={() => setAsk(false)} onOk={() => { setAsk(false); void run('load', pullFromAtlas, 'Loaded from the database', 'Loaded everything from MongoDB, replacing this browser.') }} />
    </Card>
  )
}
