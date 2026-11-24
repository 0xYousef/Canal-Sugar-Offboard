import { Avatar } from '@heroui/react'

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

export function UserAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return <Avatar size={size} color="accent" variant="soft"><Avatar.Fallback>{initials(name)}</Avatar.Fallback></Avatar>
}
