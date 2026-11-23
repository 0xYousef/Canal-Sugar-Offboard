import { useEffect, useState } from 'react'
import { Button } from '@heroui/react'
import { changeOwnPassword, setFirstPassword, useAuth, usesDemoPassword, DEMO } from '../lib/auth'
import { Dialog, TextInput } from './kit'

/** Shown to someone who signed in with the default password they were given (or an old starter one): they pick their own first. */
export function SetPassword() {
  const { user } = useAuth()
  const [demo, setDemo] = useState(false)
  const open = !!user?.mustChange || demo
  const setOpen = setDemo
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { void usesDemoPassword().then(setOpen) }, [])
  const save = async () => {
    if (pw !== again) return setErr('The two passwords are not the same.')
    if (pw === DEMO.password) return setErr('Choose a different password.')
    const e = user?.mustChange ? await setFirstPassword(pw) : await changeOwnPassword(DEMO.password, pw)
    if (e) setErr(e); else setOpen(false)
  }
  return (
    <Dialog open={open} required onClose={() => undefined} title="Choose your own password"
      footer={<Button isDisabled={!pw || !again} onPress={save}>Save password</Button>}>
      <p className="mb-4 text-sm text-muted">The password you were given is only for your first sign-in. Choose your own before you continue.</p>
      <div className="grid gap-4">
        <TextInput label="New password (8+ characters)" type="password" value={pw} onChange={(v) => { setPw(v); setErr('') }} />
        <TextInput label="Repeat the new password" type="password" value={again} onChange={(v) => { setAgain(v); setErr('') }} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </div>
    </Dialog>
  )
}
