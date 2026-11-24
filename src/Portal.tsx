import { Suspense, useEffect, useState } from 'react'
import { Button, Skeleton, Toast } from '@heroui/react'
import { Dashboard, Leavers, LeaverDetail, Tasks, Reports, Settings, Guide, Profile, preloadViews } from './views/lazy'
import { PageTurn } from './ui/PageTurn'
import { Dock, GuideButton } from './ui/Dock'
import { NavProvider, useNav } from './ui/nav'
import { Logo } from './ui/Logo'
import { ThemeToggle } from './ui/ThemeToggle'
import { DbLamp } from './ui/DbLamp'
import { UserAvatar } from './ui/ProfileDialog'
import type { User } from './lib/auth'
import { canSee, isOwner, useRbac, type Module } from './lib/rbac'
import { useStartGate } from './lib/start'
import Start from './views/Start'
import { RulesDialog } from './ui/Rules'
import { SetPassword } from './ui/SetPassword'
import { Empty } from './ui/kit'
import { startLive, stopLive, minutesToClose, useLive } from './lib/live'

const Fallback = () => (
  <div className="grid gap-4" aria-busy="true">
    <Skeleton className="h-12 w-64 rounded-xl" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
    <Skeleton className="h-64 rounded-3xl" />
  </div>
)

function Shell({ user }: { user: User }) {
  const { page, leaverId, go } = useNav()
  useRbac()
  const starting = useStartGate()
  const live = useLive()
  useEffect(() => { startLive(); return () => stopLive() }, [])
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t) }, [])
  const left = minutesToClose(live)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(preloadViews); else window.setTimeout(preloadViews, 800)
  }, [])
  const note = isOwner() ? 'Owner' : user.role

  return (
    <>
      <div className="glass-bg" aria-hidden="true" />
      <header className="glass sticky top-3 z-40 mx-auto mt-3 flex items-center justify-between gap-4 rounded-full py-1.5 pl-5 pr-2" style={{ width: 'min(92rem, calc(100% - 2rem))' }}>
        <span className="flex items-center gap-2 font-serif text-lg font-semibold">
          <Logo size={34} />
          <span className="hidden sm:inline">Canal Sugar Offboarding</span>
        </span>
        <div className="flex items-center gap-1">
          <DbLamp />
          <ThemeToggle />
          <Button variant="ghost" className="h-auto gap-2 rounded-full py-1 pl-1 pr-3" onPress={() => go('profile')} aria-label="Open my profile">
            <UserAvatar name={user.name} />
            <span className="text-left leading-tight"><span className="block text-sm font-semibold">{user.name}</span><span className="block text-xs text-muted">{note}</span></span>
          </Button>
        </div>
      </header>
      {left !== null && left > 0 && left <= 30 && (
        <div role="alert" className="glass mx-auto mt-3 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-3 text-sm" style={{ width: 'min(92rem, calc(100% - 2rem))' }}>
          <span><b>The shared file will be removed from the server at {live.endTime}</b> (in {Math.max(1, Math.round(left))} min). Export your sheet from Reports before then.</span>
          {canSee('reports') && <Button size="sm" onPress={() => go('reports')}>Go to Reports</Button>}
        </div>
      )}
      <main className="mx-auto max-w-[92rem] px-4 pb-32 pt-8 sm:px-8">
        {starting ? <Start /> : (<>
        <PageTurn pageKey={page + (leaverId ?? '')}>
          <Suspense fallback={<Fallback />}>
            {!canSee(page as Module) && <Empty>Your role does not have access to this section. Ask the Owner to change it, or pick another section below.</Empty>}
            {canSee(page as Module) && page === 'dashboard' && <Dashboard />}
            {canSee(page as Module) && page === 'leavers' && (leaverId ? <LeaverDetail id={leaverId} /> : <Leavers />)}
            {canSee(page as Module) && page === 'tasks' && <Tasks />}
            {canSee(page as Module) && page === 'reports' && <Reports />}
            {canSee(page as Module) && page === 'settings' && <Settings />}
            {canSee(page as Module) && page === 'guide' && <Guide />}
            {page === 'profile' && <Profile />}
          </Suspense>
        </PageTurn>
        </>)}
        <p className="mt-12 text-center text-xs text-muted">Developed by Canal Sugar Human Resources Team</p>
      </main>
      {!starting && <><Dock /><GuideButton /></>}
      <SetPassword />
      {!user.mustChange && <RulesDialog user={user} />}
      <Toast.Provider placement="top end" />
    </>
  )
}

export default function Portal({ user }: { user: User }) {
  return <NavProvider><Shell user={user} /></NavProvider>
}
