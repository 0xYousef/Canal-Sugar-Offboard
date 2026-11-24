import { useEffect, useState } from 'react'
import { Button, Chip, toast } from '@heroui/react'
import { deleteUser, getDefaultPassword, refreshUsers, saveUser, setDefaultPassword, transferOwnership, useAuth, type User } from '../../lib/auth'
import { useApp } from '../../lib/store'
import { atlasReady } from '../../lib/atlas'
import { isOwner, roleNames, useRbac } from '../../lib/rbac'
import { Check, Confirm, Toggle, DataTable, Dialog, Pick, TextInput } from '../../ui/kit'
import { UserAvatar } from '../../ui/ProfileDialog'
import { OnlineChip } from '../../ui/OnlineChip'

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never')

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  useApp()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [active, setActive] = useState(user?.active ?? true)
  const [archive, setArchive] = useState(user?.archive ?? false)
  const [role, setRole] = useState(user?.role ?? 'Admin')
  const [pw, setPw] = useState(user ? '' : getDefaultPassword())
  const [err, setErr] = useState('')
  const save = async () => {
    const e = await saveUser({ id: user?.id, name, email, role, active, password: pw || undefined, archive })
    if (e) return setErr(e)
    if (!user) toast.success(`${name} added. Send them ${email} and the password you set.`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={user ? 'Edit profile' : 'Add profile'}
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button onPress={save}>Save profile</Button></>}>
      <div className="grid gap-4">
        <TextInput label="Full name" value={name} onChange={setName} />
        <TextInput label="Email (used to sign in)" type="email" value={email} onChange={setEmail} />
        <Pick label="Role" value={role} onChange={setRole} options={roleNames().map((r) => ({ v: r, l: r }))} />
        <p className="-mt-2 text-sm text-muted">Roles and what they may do are set in the next tab of People and access.</p>
        <div className="grid gap-2">
          <TextInput label={user ? 'New password (leave empty to keep)' : 'Password to send them'} type="text" value={pw} onChange={setPw} />
          {user && <div><Button size="sm" variant="secondary" onPress={() => setPw(getDefaultPassword())}>Reset to the default password</Button></div>}
          <p className="text-sm text-muted">{user ? 'Any password you set here must be changed by them at their next sign-in.' : 'This is the default password. They must choose their own the first time they sign in.'}</p>
        </div>
        <Check label="Account is active" checked={active} onChange={setActive} />
        <div className="grid gap-1">
          <Check label="Can see archived leavers" checked={archive || !!user?.owner} onChange={setArchive} disabled={!!user?.owner} />
          <p className="pl-7 text-sm text-muted">Archived leavers are hidden from everyone, Admins included. Only you (the Owner) and people you tick here can see them.</p>
        </div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </div>
    </Dialog>
  )
}

function DefaultPassword({ off }: { off: boolean }) {
  useAuth()
  const [v, setV] = useState(getDefaultPassword())
  const [err, setErr] = useState('')
  return (
    <div className="panel mb-4 rounded-3xl p-4">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <TextInput label="Default password for new people" value={v} onChange={(x) => { setV(x); setErr('') }} disabled={off} />
        <Button variant="secondary" isDisabled={off || v === getDefaultPassword()} onPress={async () => { const e = await setDefaultPassword(v); if (e) setErr(e); else toast.success('Default password saved') }}>Save</Button>
      </div>
      <p className="mt-2 text-sm text-muted">Every new profile starts with this password. Send it to them with their email; they choose their own when they first sign in.</p>
      {err && <p role="alert" className="mt-1 text-sm text-danger">{err}</p>}
    </div>
  )
}

export default function Users() {
  useRbac()
  useEffect(() => { void refreshUsers(); const t = setInterval(() => void refreshUsers(), 20000); return () => clearInterval(t) }, [])
  const { user: me, users } = useAuth()
  const off = !isOwner()
  const [edit, setEdit] = useState<{ u: User | null } | null>(null)
  const [del, setDel] = useState<User | null>(null)
  const [own, setOwn] = useState<User | null>(null)
  const [err, setErr] = useState<string | null>(null)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">Each profile signs in with an email and a password and has one role. Make roles and set their permissions in the next tab.</p>
        <Button isDisabled={off} onPress={() => setEdit({ u: null })}>Add profile</Button>
      </div>
      {!atlasReady() && (
        <div role="note" className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm">
          <b>Accounts are saved in this browser only.</b> People you add here can sign in only on this computer and in this browser. To let them sign in from their own computers, set up the database (<code>VITE_DB_URL</code> in <code>.env</code>), then rebuild.
        </div>
      )}
      <DefaultPassword off={off} />
      <DataTable label="User profiles"
        cols={[{ key: 'p', label: 'Profile' }, { key: 'r', label: 'Role' }, { key: 'on', label: 'Status' }, { key: 's', label: 'Active' }, { key: 'l', label: 'Last sign-in' }, { key: 'j', label: 'Joined' }, { key: 'a', label: '' }]}
        rows={users.map((u) => ({
          id: u.id,
          cells: [
            <div key="p" className="flex items-center gap-3"><UserAvatar name={u.name} />
              <div><div className="font-semibold">{u.name}{u.id === me?.id && <span className="ml-2 text-xs font-normal text-muted">you</span>}</div><div className="text-sm text-muted">{u.email}</div></div></div>,
            <span key="r" className="flex flex-wrap items-center gap-1.5"><Chip size="sm" variant="soft" color={u.role === 'Admin' ? 'accent' : 'default'}><Chip.Label>{u.role}</Chip.Label></Chip>{u.owner && <Chip size="sm" variant="primary" color="accent"><Chip.Label>Owner</Chip.Label></Chip>}{u.archive && !u.owner && <Chip size="sm" variant="soft"><Chip.Label>Sees archive</Chip.Label></Chip>}</span>,
            <OnlineChip key="on" u={u} />,
            <Toggle key="s" on={u.active} disabled={off || u.owner} label={`Active ${u.name}`}
              onChange={async (v) => { const e = await saveUser({ ...u, active: v }); if (e) setErr(e) }} />,
            <span key="l" className="text-sm text-muted">{when(u.lastLogin)}</span>,
            <span key="j" className="whitespace-nowrap text-sm text-muted">{u.createdAt ? new Date(u.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</span>,
            <div key="a" className="flex gap-1">
              <Button size="sm" variant="secondary" isDisabled={off} onPress={() => setEdit({ u })}>Edit</Button>
              {!u.owner && u.active && <Button size="sm" variant="secondary" isDisabled={off} onPress={() => setOwn(u)}>Make owner</Button>}
              <Button size="sm" variant="danger-soft" isDisabled={off || u.id === me?.id || u.owner} onPress={() => setDel(u)}>Delete</Button>
            </div>,
          ],
        }))} />
      <p className="mt-3 text-sm text-muted">Profiles and password hashes are stored in this browser. They are a sign-in screen, not a security boundary: a server must enforce access before real use.</p>
      {edit && <UserForm user={edit.u} onClose={() => setEdit(null)} />}
      <Confirm open={!!del} title={`Delete ${del?.name}?`} text="They will no longer be able to sign in." onClose={() => setDel(null)}
        onOk={async () => { const e = await deleteUser(del!.id); setDel(null); if (e) setErr(e) }} />
      <Confirm open={!!own} title={`Make ${own?.name} the Owner?`} text="They become the only person who can manage profiles, access and the database. You stay an Admin but lose those powers."
        onClose={() => setOwn(null)} onOk={async () => { const e = await transferOwnership(own!.id); setOwn(null); if (e) setErr(e) }} />
      <Confirm open={!!err} title="Not allowed" text={err} onClose={() => setErr(null)} />
    </>
  )
}
