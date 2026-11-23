import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** The new page rises out of the dock. The old page unmounts at once, so only one heavy tree is ever live. */
export function PageTurn({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const reduce = useReducedMotion() || 'startViewTransition' in document
  return (
    <motion.div
      key={pageKey}
      initial={reduce ? false : { opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
      style={{ transformOrigin: '50% 100%' }}
    >
      {children}
    </motion.div>
  )
}
