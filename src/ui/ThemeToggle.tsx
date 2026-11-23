import { Button } from '@heroui/react'
import { useTheme } from '../lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <Button isIconOnly variant="ghost" size="sm" className="rounded-full" onPress={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
        {dark
          ? <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5h0l1 3h-2l1-3Zm0 20-1-3h2l-1 3ZM2 12l3-1v2l-3-1Zm20 0-3 1v-2l3 1ZM4.9 4.9l2.8 1.4-1.4 1.4L4.9 4.9Zm14.2 14.2-2.8-1.4 1.4-1.4 1.4 2.8ZM4.9 19.1l1.4-2.8 1.4 1.4-2.8 1.4ZM19.1 4.9l-1.4 2.8-1.4-1.4 2.8-1.4Z" />
          : <path d="M21 14.5A9 9 0 0 1 9.5 3a9 9 0 1 0 11.5 11.5Z" />}
      </svg>
    </Button>
  )
}
