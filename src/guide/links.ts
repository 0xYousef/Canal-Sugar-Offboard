// Where the guide videos live. Paste the Google Drive links once you have uploaded them
// (or edit them in the app: Guide -> Edit video links). Saved in this browser.
import { useSyncExternalStore } from 'react'
import { TOPICS } from './topics'

export interface GuideLinks { folder: string; windows: string; topics: Record<string, string> }

/** Videos that ship with the app (public/guide-videos). A link saved in the app replaces one of these. */
export const DEFAULT_LINKS: GuideLinks = {
  folder: '',
  windows: 'https://drive.google.com/file/d/142XMCKD2d_RolcxOkiawx4GnskwoqsYZ/view?usp=sharing',   // Windows zip (see release/)
  topics: Object.fromEntries(TOPICS.map((t) => [t.id, `/guide-videos/${t.id}.mp4`])),
}

const KEY = 'offboarding.guide.links.v1'
let links: GuideLinks = DEFAULT_LINKS
try {
  const raw = localStorage.getItem(KEY)
  if (raw) { const s = JSON.parse(raw); links = { folder: s.folder ?? '', windows: s.windows || DEFAULT_LINKS.windows, topics: { ...DEFAULT_LINKS.topics, ...(s.topics ?? {}) } } }
} catch { /* ignore */ }
let version = 0
const listeners = new Set<() => void>()

export function saveLinks(next: GuideLinks) {
  links = { folder: next.folder, windows: next.windows || DEFAULT_LINKS.windows, topics: { ...DEFAULT_LINKS.topics, ...next.topics } }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  version++; listeners.forEach((f) => f())
}
export function useLinks() {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => version)
  return links
}

/** True for a video file we host (or any direct .mp4/.webm link), which plays in a <video> tag. */
export const isFileUrl = (u: string) => u.startsWith('/') || /\.(mp4|webm|mov)(\?|$)/i.test(u)

/** Turn a Drive "view" link into the embeddable player URL. Returns '' when it cannot be embedded. */
export function embedUrl(url: string) {
  const id = url.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1]
  return id ? `https://drive.google.com/file/d/${id}/preview` : ''
}
