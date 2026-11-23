import { Button, Card } from '@heroui/react'
import { Reader } from './settings/Sources'
import { finishStart, startEmpty } from '../lib/start'
import { useAuth } from '../lib/auth'

/** Shown once after the first sign-in: load the leaver file and go. */
export default function Start() {
  const { user } = useAuth()
  const first = (user?.name ?? '').split(' ')[0]
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-medium">Welcome{first ? ', ' + first : ''}. Let&rsquo;s load your leavers.</h1>
      <p className="mb-6 mt-2 max-w-xl text-sm text-muted">
        Upload the spreadsheet you keep today and the portal will set up every leaver and every deadline from it.
        A full backup file from this app works too and brings back everything, including your rules.
      </p>
      <Reader first onDone={finishStart} />
      <Card className="mt-4">
        <Card.Content className="flex-row flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">No file yet? You can load one later under Settings, Import leavers.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onPress={startEmpty}>Start without a file</Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}
