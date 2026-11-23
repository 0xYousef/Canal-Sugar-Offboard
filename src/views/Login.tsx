import { useState, type FormEvent } from 'react'
import { Button, Input, Label, TextField } from '@heroui/react'
import { login } from '../lib/auth'
import { atlasReady } from '../lib/atlas'
import { Logo } from '../ui/Logo'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Check } from '../ui/kit'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !pw) return setErr('Enter your email and password.')
    setBusy(true); setErr('')
    const res = await login(email, pw, remember)
    setBusy(false)
    if (res) setErr(res)
  }

  const [caps, setCaps] = useState(false)
  const icon = (d: string) => <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
  const MAIL = 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8 7.2L4.6 6.4V8L12 12.8 19.4 8V6.4L12 11.2Z'
  const LOCK = 'M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2ZM9 7a3 3 0 0 1 6 0v2H9V7Zm3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z'
  const points = [
    ['Deadlines that count themselves', 'Working days, weekends and holidays are handled for you.'],
    ['Every action on record', 'See who did what, and to which employee.'],
    ['One list for every team', 'HR, IT, Legal and the rest work from the same sheet.'],
  ]

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="glass-bg" aria-hidden="true" />
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden lg:block" aria-label="About">
          <div className="flex items-center gap-4"><Logo size={64} /><span className="font-serif text-3xl font-semibold tracking-tight">Canal Sugar</span></div>
          <h1 className="mt-6 max-w-md text-5xl font-semibold leading-[1.05]">Offboarding, done on time.</h1>
          <p className="mt-4 max-w-md text-base text-muted">Canal Sugar's single place to track everyone who is leaving, and every task that has to happen before they go.</p>
          <ul className="mt-8 grid max-w-md gap-4">
            {points.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-accent" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5-5 1.4 1.4-6.4 6.4Z" /></svg>
                <span><b className="block">{t}</b><span className="text-sm text-muted">{d}</span></span>
              </li>
            ))}
          </ul>
        </section>

        <main className="glass mx-auto w-full max-w-md rounded-[2rem] p-8 sm:p-10">
          <div className="mb-7 flex items-center gap-3 lg:hidden"><Logo size={44} /><span className="font-serif text-lg font-semibold">Canal Sugar Offboarding</span></div>
          <h2 className="text-3xl font-semibold">Welcome back</h2>
          <p className="mb-7 mt-1 text-sm text-muted">Sign in to see your leavers and tasks.</p>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <TextField value={email} onChange={setEmail} aria-label="Email or username" autoFocus>
              <Label>Email or username</Label>
              <div className="relative">{icon(MAIL)}<Input type="text" autoComplete="username" placeholder="you@company.com or sara" className="w-full pl-11" /></div>
            </TextField>
            <TextField value={pw} onChange={setPw} aria-label="Password">
              <Label>Password</Label>
              <div className="relative">
                {icon(LOCK)}
                <Input type={show ? 'text' : 'password'} autoComplete="current-password" className="w-full pl-11 pr-16"
                  onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))} onBlur={() => setCaps(false)} />
                <button type="button" onClick={() => setShow((x) => !x)} aria-pressed={show}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1 text-sm font-medium text-accent">{show ? 'Hide' : 'Show'}</button>
              </div>
              {caps && <p className="mt-1 text-xs text-warning" role="status">Caps Lock is on.</p>}
            </TextField>
            <Check label="Keep me signed in on this device" checked={remember} onChange={setRemember} />
            {err && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
            <Button type="submit" size="lg" isPending={busy} className="mt-1 w-full">Sign in</Button>
          </form>
          {!atlasReady() && (
            <p role="note" className="mt-5 rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
              <b>Accounts are stored only in this browser.</b> A person added on another computer or browser cannot sign in here until the database is set up.
            </p>
          )}
          <p className="mt-6 text-center text-sm text-muted">No account yet? Ask the Owner to add you, then sign in with the email and password they send you.</p>
        </main>
      </div>
    </div>
  )
}
