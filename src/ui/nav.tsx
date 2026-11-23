import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'leavers', label: 'Leavers' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
  { id: 'guide', label: 'Guide' },
] as const
export type PageId = (typeof PAGES)[number]['id']

interface Route { page: PageId; leaverId?: string }
interface Nav extends Route {
  /** 1 = turn forward (old page lifts away), -1 = turn back (new page lays down on top) */
  dir: 1 | -1
  go: (page: PageId, leaverId?: string, origin?: { x: number; y: number }) => void
}

const Ctx = createContext<Nav | null>(null)
const depth = (r: Route) => PAGES.findIndex((p) => p.id === r.page) * 2 + (r.leaverId ? 1 : 0)

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ route: Route; dir: 1 | -1 }>({ route: { page: 'dashboard' }, dir: 1 })
  const go = useCallback((page: PageId, leaverId?: string, origin?: { x: number; y: number }) => {
    const update = () => {
      document.documentElement.dataset.section = page
      setState((s) => {
        const next = { page, leaverId }
        if (depth(next) === depth(s.route) && next.leaverId === s.route.leaverId) return s
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
  useEffect(() => { document.documentElement.dataset.section = state.route.page }, [state.route.page])
  return <Ctx.Provider value={{ ...state.route, dir: state.dir, go }}>{children}</Ctx.Provider>
}

export function useNav() {
  const c = useContext(Ctx)
  if (!c) throw new Error('NavProvider missing')
  return c
}
