import { Chip } from '@heroui/react'
import { isOnline, type User } from '../lib/auth'

export function OnlineChip({ u }: { u: User }) {
  const on = isOnline(u)
  return (
    <Chip size="sm" variant="soft" color={on ? 'success' : 'default'}>
      <span className={`mr-1.5 inline-block size-2 rounded-full ${on ? 'bg-success' : 'bg-muted'}`} aria-hidden="true" />
      <Chip.Label>{on ? 'Online' : 'Offline'}</Chip.Label>
    </Chip>
  )
}
