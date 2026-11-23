import { useState } from 'react'
import { Button } from '@heroui/react'
import { rulesFor } from '../lib/rules'
import { useLive } from '../lib/live'
import { log } from '../lib/audit'
import { localToday } from '../lib/dates'
import { Check, Dialog } from './kit'
import type { User } from '../lib/auth'

const key = (u: User) => 'offboarding.rules.ack.' + u.id
const seen = (u: User) => { try { return localStorage.getItem(key(u)) === localToday() } catch { return false } }

/** Shown at the first opening each day. Everyone has to tick it before they can work. */
export function RulesDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(() => !seen(user))
  const [ok, setOk] = useState(false)
  const live = useLive()
  const RULES = rulesFor(live.enabled ? live.endTime : undefined)
  const go = () => {
    try { localStorage.setItem(key(user), localToday()) } catch { /* ignore */ }
    log('Rules acknowledged', 'Read and accepted the working rules for the day.')
    setOpen(false)
  }
  return (
    <Dialog open={open} required onClose={() => undefined} title="Before you start"
      footer={<Button isDisabled={!ok} onPress={go}>Continue to the portal</Button>}>
      <p className="mb-4 text-sm text-muted">Everyone follows these rules.</p>
      <ol className="mb-5 grid gap-3">
        {RULES.map((r, i) => (
          <li key={r.title} className="flex gap-3">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground" aria-hidden="true">{i + 1}</span>
            <span><b className="block">{r.title}</b><span className="text-sm text-muted">{r.text}</span></span>
          </li>
        ))}
      </ol>
      <Check label="I have read these rules and I will follow them" checked={ok} onChange={setOk} />
    </Dialog>
  )
}
