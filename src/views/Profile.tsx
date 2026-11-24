import { useState } from 'react'
import { Button, toast } from '@heroui/react'
import { changeOwnPassword, currentUser, logout, namesOf, saveProfile, useAuth } from '../lib/auth'
import { Dialog, PageHead, Pick, TextInput } from '../ui/kit'
import { UserAvatar } from '../ui/ProfileDialog'
import { OnlineChip } from '../ui/OnlineChip'
import { useNav } from '../ui/nav'

const SENIORITY = ['Intern', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Manager', 'Director', 'Executive']

export default function Profile() {
  useAuth()
  const user = currentUser()
  if (!user) return null
  return <Form key={user.id} />
}

function Form() {
  const user = currentUser()!
  const n = namesOf(user)
  const [first, setFirst] = useState(n.first), [last, setLast] = useState(n.last)
  const [job, setJob] = useState(user.job ?? ''), [seniority, setSeniority] = useState(user.seniority ?? '')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [pw, setPw] = useState(false)
  const { go } = useNav()
  const dirty = first !== n.first || last !== n.last || job !== (user.job ?? '') || seniority !== (user.seniority ?? '')

  const save = async () => {
    setBusy(true); setErr('')
    const e = await saveProfile({ firstName: first, lastName: last, job, seniority })
    setBusy(false)
    if (e) setErr(e); else toast.success('Profile saved')
  }

  return (
    <div>
      <PageHead title="My profile" sub="Your details, as other people see them." onBack={() => go('dashboard')} />
      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="panel grid justify-items-center gap-3 rounded-3xl p-6 text-center">
          <UserAvatar name={`${first} ${last}`.trim() || user.name} size="lg" />
          <div className="min-w-0 max-w-full">
            <p className="truncate text-lg font-semibold">{`${first} ${last}`.trim() || user.name}</p>
            <p className="truncate text-sm text-muted">{[job, seniority].filter(Boolean).join(' · ') || (user.owner ? 'Owner' : user.role)}</p>
          </div>
          <OnlineChip u={user} />
          <dl className="grid w-full gap-1 border-t border-separator pt-3 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted">Role</dt><dd>{user.owner ? 'Owner' : user.role}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Joined</dt><dd>{user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</dd></div>
          </dl>
          <Button type="button" variant="danger-soft" className="w-full" onPress={logout}>Sign out</Button>
        </div>
        <form className="panel grid gap-4 rounded-3xl p-6 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <TextInput label="First name" value={first} onChange={setFirst} />
          <TextInput label="Last name" value={last} onChange={setLast} />
          <TextInput label="Job title" value={job} onChange={setJob} placeholder="e.g. HR Business Partner" />
          <Pick label="Seniority" value={seniority || '__none'} onChange={(v) => setSeniority(v === '__none' ? '' : v)} options={[{ v: '__none', l: 'Not set' }, ...SENIORITY.map((x) => ({ v: x, l: x }))]} />
          <div className="sm:col-span-2">
            <TextInput label="Email" type="email" value={user.email} onChange={() => undefined} disabled />
            <p className="mt-1 text-xs text-muted">You sign in with this email. Ask the Owner if it needs to change.</p>
          </div>
          {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="submit" isPending={busy} isDisabled={!dirty}>Save changes</Button>
            <Button type="button" variant="secondary" onPress={() => setPw(true)}>Change password</Button>
          </div>
        </form>
      </div>
      {pw && <PasswordDialog onClose={() => setPw(false)} />}
    </div>
  )
}

/** Old password, then the new one twice. */
function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState(''), [next, setNext] = useState(''), [again, setAgain] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const problem = !cur ? 'Enter your current password.' : next.length < 8 ? 'The new password needs at least 8 characters.' : next === cur ? 'Choose a password different from the current one.' : next !== again ? 'The two new passwords do not match.' : ''
  const save = async () => {
    if (problem) return setErr(problem)
    setBusy(true)
    const e = await changeOwnPassword(cur, next)
    setBusy(false)
    if (e) return setErr(e)
    toast.success('Password changed')
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Change password"
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button isPending={busy} isDisabled={!cur || !next || !again} onPress={() => void save()}>Change password</Button></>}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <TextInput label="Current password" type="password" value={cur} onChange={(v) => { setCur(v); setErr('') }} />
        <TextInput label="New password (8+ characters)" type="password" value={next} onChange={(v) => { setNext(v); setErr('') }} />
        <TextInput label="Repeat the new password" type="password" value={again} onChange={(v) => { setAgain(v); setErr('') }} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </form>
    </Dialog>
  )
}
