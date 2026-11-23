import { useDbStatus } from '../lib/atlas'
import { useLive } from '../lib/live'

const LABEL = { off: 'Database not set up', checking: 'Checking the database', ok: 'Database connected', error: 'Database problem' } as const
const COLOR = { off: 'color-mix(in oklab, currentColor 35%, transparent)', checking: 'var(--warning)', ok: 'var(--success)', error: 'var(--danger)' } as const

/** A small lamp: green when the MongoDB link works, red when it fails, amber while checking, grey when not set up. */
export function DbLamp() {
  const { state, text } = useDbStatus()
  const live = useLive()
  const detail = (state === 'error' ? `${LABEL.error}: ${text}` : LABEL[state]) + (live.status === 'live' ? '. Live: changes from other people appear within a few seconds.' : live.status === 'error' ? `. Live sync stopped: ${live.detail}` : '')
  return (
    <span role="status" aria-label={detail} title={detail} className="mr-1 inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted">
      <i className={`size-2.5 rounded-full ${state === 'ok' ? 'db-lamp' : ''}`} style={{ background: COLOR[state], boxShadow: state === 'ok' || state === 'error' ? `0 0 0 3px color-mix(in oklab, ${COLOR[state]} 25%, transparent), 0 0 10px ${COLOR[state]}` : undefined }} />
      <span className="hidden md:inline">{state === 'ok' ? 'Database' : state === 'error' ? 'Database offline' : state === 'checking' ? 'Checking' : 'No database'}</span>
    </span>
  )
}
