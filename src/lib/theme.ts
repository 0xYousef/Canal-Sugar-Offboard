import { useSyncExternalStore } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
const KEY = 'offboarding.theme'
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
let pref: ThemePref = 'system'
try { pref = (localStorage.getItem(KEY) as ThemePref) || 'system' } catch { /* ignore */ }

const resolved = () => (pref === 'system' ? (mq?.matches ? 'dark' : 'light') : pref)
const listeners = new Set<() => void>()

function apply() {
  const r = resolved()
  const el = document.documentElement
  el.classList.toggle('dark', r === 'dark')
  el.dataset.theme = r
  el.style.colorScheme = r
  listeners.forEach((f) => f())
}
mq?.addEventListener('change', () => { if (pref === 'system') apply() })

export function setTheme(p: ThemePref) {
  pref = p
  try { localStorage.setItem(KEY, p) } catch { /* ignore */ }
  apply()
}
export function useTheme() {
  const r = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, resolved)
  return { theme: r as 'light' | 'dark', pref, toggle: () => setTheme(r === 'dark' ? 'light' : 'dark') }
}
apply()
