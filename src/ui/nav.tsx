import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'leavers', label: 'Leavers' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
  { id: 'guide', label: 'Guide' },
  { id: 'profile', label: 'My profile' },
] as const
export type PageId = (typeof PAGES)[number]['id']

/** `topic` and `tab` are the Settings page and its tab, kept in the address so a refresh stays where you are. */
interface Route { page: PageId; leaverId?: string; topic?: string; tab?: string }
interface Nav extends Route {
  /** 1 = turn forward (old page lifts away), -1 = turn back (new page lays down on top) */
  dir: 1 | -1
  go: (page: PageId, leaverId?: string, origin?: { x: number; y: number }) => void
  /** Settings: open a topic (or null for the list) and optionally a tab inside it. */
  setSub: (topic: string | null, tab?: string | null, replace?: boolean) => void
}

/* ---- the address: #/tasks, #/leavers/<id>, #/settings/<topic>/<tab> ---- */
const slug = (x: string) => encodeURIComponent(x)
export function parseHash(h: string = typeof location === 'undefined' ? '' : location.hash): Route {
  const [page, a, b] = h.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const p = PAGES.find((x) => x.id === page)?.id
  if (!p) return { page: 'dashboard' }
  if (p === 'leavers') return { page: p, leaverId: a }
  if (p === 'settings') return { page: p, topic: a, tab: b }
  return { page: p }
}
export function hashOf(r: Route) {
  const parts: string[] = [r.page]
  if (r.page === 'leavers' && r.leaverId) parts.push(slug(r.leaverId))
  if (r.page === 'settings' && r.topic) { parts.push(slug(r.topic)); if (r.tab) parts.push(slug(r.tab)) }
  return '#/' + parts.join('/')
}
const write = (r: Route, replace = false) => {
  const h = hashOf(r)
  if (location.hash === h) return
  try { (replace ? history.replaceState : history.pushState).call(history, null, '', h) } catch { location.hash = h }
}

const Ctx = createContext<Nav | null>(null)
const depth = (r: Route) => PAGES.findIndex((p) => p.id === r.page) * 2 + (r.leaverId ? 1 : 0)

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ route: Route; dir: 1 | -1 }>(() => ({ route: parseHash(), dir: 1 }))
  const go = useCallback((page: PageId, leaverId?: string, origin?: { x: number; y: number }) => {
    const update = () => {
      document.documentElement.dataset.section = page
      setState((s) => {
        const next: Route = { page, leaverId }
        if (depth(next) === depth(s.route) && next.leaverId === s.route.leaverId && !s.route.topic) return s
        write(next)
        window.scrollTo({ top: 0 })
        return { route: next, dir: depth(next) >= depth(s.route) ? 1 : -1 }
      })
    }
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }).startViewTransition
    if (!vt || !origin || matchMedia('(prefers-reduced-motion: reduce)').matches) return update()
    // Circular reveal: the new page (with its own colours) grows out of the clicked icon.
    const { x, y } = origin
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const tr = vt.call(document, () => flushSync(update))
    void tr.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(.45,.05,.2,1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
  }, [])
  const setSub = useCallback((topic: string | null, tab?: string | null, replace = false) => {
    setState((s) => {
      const next: Route = { page: 'settings', topic: topic ?? undefined, tab: tab ?? undefined }
      write(next, replace)
      return { route: next, dir: s.dir }
    })
  }, [])
  useEffect(() => { document.documentElement.dataset.section = state.route.page }, [state.route.page])
  // Back / forward, or an address typed or pasted in.
  useEffect(() => {
    const onNav = () => setState((s) => { const next = parseHash(); return { route: next, dir: depth(next) >= depth(s.route) ? 1 : -1 } })
    window.addEventListener('popstate', onNav); window.addEventListener('hashchange', onNav)
    if (!location.hash) write(state.route, true)       // show where we are from the start
    return () => { window.removeEventListener('popstate', onNav); window.removeEventListener('hashchange', onNav) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <Ctx.Provider value={{ ...state.route, dir: state.dir, go, setSub }}>{children}</Ctx.Provider>
}

export function useNav() {
  const c = useContext(Ctx)
  if (!c) throw new Error('NavProvider missing')
  return c
}
