import { useState } from 'react'
import { Avatar, Button } from '@heroui/react'
import { changeOwnPassword, logout, renameSelf, type User } from '../lib/auth'
import { Dialog, TextInput } from './kit'

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

export function UserAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return <Avatar size={size} color="accent" variant="soft"><Avatar.Fallback>{initials(name)}</Avatar.Fallback></Avatar>
}

export function ProfileDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [name, setName] = useState(user.name)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    renameSelf(name)
    if (cur || next) {
      const e = await changeOwnPassword(cur, next)
      if (e) return setMsg({ ok: false, text: e })
      setCur(''); setNext('')
    }
    setMsg({ ok: true, text: 'Profile saved.' })
  }
  return (
    <Dialog open onClose={onClose} title="My profile"
      footer={<>
        <Button variant="danger-soft" className="mr-auto" onPress={() => { onClose(); logout() }}>Sign out</Button>
        <Button variant="tertiary" onPress={onClose}>Close</Button>
        <Button onPress={save}>Save</Button>
      </>}>
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} size="lg" />
          <div className="text-sm"><div className="font-semibold">{user.email}</div><div className="text-muted">{user.owner ? 'Owner' : user.role}</div></div>
        </div>
        <TextInput label="Name" value={name} onChange={setName} />
        <p className="text-sm font-medium">Change password</p>
        <TextInput label="Current password" type="password" value={cur} onChange={setCur} />
        <TextInput label="New password (8+ characters)" type="password" value={next} onChange={setNext} />
        {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      </div>
    </Dialog>
  )
}
