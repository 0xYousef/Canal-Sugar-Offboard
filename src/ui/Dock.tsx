import { motion } from 'motion/react'
import { PAGES, useNav } from './nav'
import { preloadViews } from '../views/lazy'
import { canSee, useRbac } from '../lib/rbac'

const ICONS: Record<string, string> = {
  guide: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 16h-2v-2h2v2Zm2.1-7.7-.9.9c-.7.7-1.2 1.2-1.2 2.8h-2v-.5c0-1.1.5-2.1 1.2-2.8l1.2-1.3c.4-.3.6-.8.6-1.4 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 .9-.4 1.7-.9 2.3Z',
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  leavers: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21a8 8 0 0 1 16 0H4Z',
  tasks: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
  reports: 'M5 9h3v10H5V9Zm5.5-5h3v15h-3V4ZM16 13h3v6h-3v-6Z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.5c.1-.3.1-.7.1-1s0-.7-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6c-.1.3-.1.7-.1 1s0 .7.1 1l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.7h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6Z',
}

/**
 * Morphing tab bar: the selected section grows into a pill that slides to its new spot and
 * reveals its name, while the icon pops. No pointer tracking, so idle cost is zero.
 */
export function Dock() {
  const { page, go } = useNav()
  useRbac()
  return (
    <nav aria-label="Sections" onPointerEnter={preloadViews}
      className="glass dock fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full p-1.5 shadow-2xl">
      <ul className="flex items-center gap-0.5">
        {PAGES.filter((p) => p.id !== 'guide' && canSee(p.id)).map((p) => {
          const active = page === p.id
          return (
            <motion.li key={p.id} layout transition={{ type: 'spring', stiffness: 520, damping: 38 }} className="relative">
              {active && (
                <motion.span layoutId="dock-pill" className="absolute inset-0 rounded-full bg-accent shadow-lg"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }} />
              )}
              <button
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); go(p.id, undefined, { x: r.left + r.width / 2, y: r.top + r.height / 2 }) }}
                aria-current={active ? 'page' : undefined}
                aria-label={p.label}
                className={`relative flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors ${active ? 'text-accent-foreground' : 'text-muted hover:bg-foreground/10 hover:text-foreground'}`}
              >
                <motion.svg
                  key={active ? 'on' : 'off'}
                  initial={active ? { scale: 0.4, rotate: -25 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 14 }}
                  viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden="true"
                ><path d={ICONS[p.id]} /></motion.svg>
                {active && (
                  <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} transition={{ duration: 0.2 }} className="overflow-hidden whitespace-nowrap">
                    {p.label}
                  </motion.span>
                )}
              </button>
            </motion.li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Help lives apart from the sections: a round button in the bottom-right corner. */
export function GuideButton() {
  const { page, go } = useNav()
  useRbac()
  if (!canSee('guide')) return null
  const active = page === 'guide'
  return (
    <button
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); go('guide', undefined, { x: r.left + r.width / 2, y: r.top + r.height / 2 }) }}
      aria-label="Guide: how to use this app" aria-current={active ? 'page' : undefined} title="Guide"
      style={{ background: 'linear-gradient(145deg,#8b7bff,#5b45e6)', color: '#fff' }}
      className={`fixed bottom-5 right-4 z-50 grid size-14 place-items-center rounded-full shadow-2xl shadow-[#5b45e6]/40 transition-transform hover:scale-105 active:scale-95 sm:right-8 ${active ? 'ring-4 ring-white/70' : ''}`}>
      <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true"><path d={ICONS.guide} /></svg>
    </button>
  )
}
