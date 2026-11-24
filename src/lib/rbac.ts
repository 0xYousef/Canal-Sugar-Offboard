// Roles the Owner makes, and what each may do in each section. "Admin" always exists and can do everything.
// Like sign-in, this lives in the browser: it keeps honest people in their lane but is not server-side security.
import { useSyncExternalStore } from 'react'
import { session } from './store'
import { log } from './audit'
import { atlasCall, atlasQuery, atlasReady } from './atlas'

export type Module = 'dashboard' | 'leavers' | 'tasks' | 'reports' | 'settings' | 'logs' | 'guide'
export type Perm = 'view' | 'edit' | 'action'

export const MODULES: { id: Module; label: string; perms: Perm[]; edit?: string; action?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', perms: ['view', 'action'], action: 'Mark tasks from the attention list' },
  { id: 'leavers', label: 'Leavers', perms: ['view', 'edit', 'action'], edit: 'Add, change and delete leavers', action: 'Take action on a leaver’s tasks' },
  { id: 'tasks', label: 'Tasks', perms: ['view', 'action'], action: 'Take action on tasks' },
  { id: 'reports', label: 'Reports', perms: ['view', 'action'], action: 'Download CSV reports' },
  { id: 'settings', label: 'Settings', perms: ['view', 'edit'], edit: 'Change rules, lists and data' },
  { id: 'logs', label: 'Activity log', perms: ['view', 'action'], action: 'Export the log to Excel' },
  { id: 'guide', label: 'Guide', perms: ['view', 'edit'], edit: 'Change the video links' },
]
export const PERM_LABEL: Record<Perm, string> = { view: 'View', edit: 'Edit', action: 'Take action' }
export const ADMIN = 'Admin'

/** Extra rights, switched on per role. Admin and the Owner always have them. */
export type Extra = 'import' | 'removeFile' | 'restore'
export const EXTRAS: { id: Extra; label: string; text: string }[] = [
  { id: 'import', label: 'Import leavers', text: 'Load a leaver list from a CSV, Excel or JSON file (Settings, Import leavers).' },
  { id: 'removeFile', label: 'Remove the shared file', text: 'Delete the shared sheet from the server for everyone, before closing time.' },
  { id: 'restore', label: 'Restore archived leavers', text: 'Bring a leaver back from the archive. They must also be allowed to see the archive.' },
]
export interface Role { name: string; perms: Partial<Record<Module, Perm[]>>; teams: string[] | null; extras?: Extra[] }

const KEY = 'offboarding.rbac.v3'
let roles: Role[] = []
if (!atlasReady()) { try { const raw = localStorage.getItem(KEY); if (raw) roles = JSON.parse(raw) } catch { /* ignore */ } }
let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((f) => f()) }
let pending: ReturnType<typeof setTimeout> | undefined
/** With the database set up, roles live there so every computer sees the same ones; otherwise in this browser. */
const persist = () => {
  if (!atlasReady()) { try { localStorage.setItem(KEY, JSON.stringify(roles)) } catch { /* ignore */ } return }
  clearTimeout(pending)
  pending = setTimeout(() => { void atlasCall('/config' + atlasQuery(), { method: 'PUT', body: JSON.stringify({ roles }) }).catch(() => undefined) }, 400)
}
/** Roles as the database has them, loaded after sign-in. */
export function setRemoteRoles(list: Role[]) { roles = Array.isArray(list) ? list : []; notify() }

export function useRbac() {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => version)
}

export const isOwner = () => session.owner
/** Archived leavers are hidden from everyone, including Admins, until the Owner allows a person to see them. */
export const canSeeArchive = () => session.owner || session.archive
export const allRoles = () => roles
export const roleNames = () => [ADMIN, ...roles.map((r) => r.name)]
const roleOf = (name: string) => roles.find((r) => r.name === name)
const isAdmin = () => session.owner || session.role === ADMIN

/** What the signed-in person may do. An unknown role (for example a deleted one) gets view only. */
export function can(m: Module, p: Perm) {
  if (isAdmin()) return true
  const r = roleOf(session.role)
  return (r?.perms[m] ?? (p === 'view' && m !== 'logs' ? ['view'] : [])).includes(p)
}
/** An extra right: the Owner and Admins always have it, other roles only when it is switched on. */
export const hasExtra = (x: Extra) => isAdmin() || !!roleOf(session.role)?.extras?.includes(x)
/** The Settings page opens for anyone who may see settings or the activity log (the log lives inside it). */
export const canSee = (m: Module) => ((m as string) === 'profile' ? true : m === 'settings' ? can('settings', 'view') || can('logs', 'view') : can(m, 'view'))
/** Take action on one task: needs "take action" here, and the task's team must be one the role covers. */
export function canAct(m: Module, group: string) {
  if (isAdmin()) return true
  const r = roleOf(session.role)
  return can(m, 'action') && (!r || r.teams === null || r.teams.includes(group))
}

/* ---- Owner only below ---- */
const guard = () => session.owner
/** Starting points for a new role. Everything can still be changed switch by switch afterwards. */
export type Template = 'view' | 'junior' | 'lead'
export const TEMPLATES: { id: Template; label: string; text: string }[] = [
  { id: 'view', label: 'View only', text: 'Sees every section except the activity log. Cannot change or act.' },
  { id: 'junior', label: 'Junior: can take action', text: 'Sees every section and can take action on tasks (done, waive, block) and export from Reports. Cannot edit leavers or settings.' },
  { id: 'lead', label: 'Team lead: edit and take action', text: 'Everything a junior can do, and can also add, edit and delete leavers.' },
]
const presetPerms = (t: Template): Partial<Record<Module, Perm[]>> => Object.fromEntries(MODULES.filter((m) => m.id !== 'logs').map((m) => {
  const acts = ['dashboard', 'leavers', 'tasks', 'reports'].includes(m.id)
  const p: Perm[] = t === 'view' || !acts ? ['view'] : t === 'junior' ? ['view', 'action'] : m.id === 'leavers' ? ['view', 'edit', 'action'] : ['view', 'action']
  return [m.id, p]
}))
export function addRole(name: string, template: Template = 'view'): string | null {
  if (!guard()) return 'Only the Owner can add roles.'
  const n = name.trim()
  if (!n) return 'Enter a name for the role.'
  if (n.length > 40) return 'Keep the name under 40 characters.'
  if (roleNames().some((r) => r.toLowerCase() === n.toLowerCase())) return 'A role with this name already exists.'
  roles = [...roles, { name: n, perms: presetPerms(template), teams: null }]
  log('Role added', `Role ${n} was added as "${TEMPLATES.find((x) => x.id === template)!.label}".`); persist(); notify(); return null
}
export function removeRole(name: string) {
  if (!guard()) return
  roles = roles.filter((r) => r.name !== name); log('Role deleted', `Role ${name} was deleted.`); persist(); notify()
}
export function renameRoleTo(from: string, to: string): string | null {
  if (!guard()) return 'Only the Owner can rename roles.'
  const n = to.trim()
  if (!n) return 'Enter a name for the role.'
  if (roleNames().some((r) => r.toLowerCase() === n.toLowerCase() && r !== from)) return 'A role with this name already exists.'
  roles = roles.map((r) => (r.name === from ? { ...r, name: n } : r))
  log('Role renamed', `Role ${from} is now called ${n}.`); persist(); notify(); return null
}
/** Turning on edit/action also turns on view; turning off view turns off the rest. */
export function setPerm(role: string, m: Module, p: Perm, on: boolean) {
  if (!guard()) return
  roles = roles.map((r) => {
    if (r.name !== role) return r
    const cur = new Set(r.perms[m] ?? (m === 'logs' ? [] : ['view']))
    if (on) { cur.add(p); if (p !== 'view') cur.add('view') } else if (p === 'view') cur.clear(); else cur.delete(p)
    return { ...r, perms: { ...r.perms, [m]: [...cur] as Perm[] } }
  })
  log('Access changed', `${role}: ${PERM_LABEL[p]} on ${MODULES.find((x) => x.id === m)!.label} turned ${on ? 'on' : 'off'}.`)
  persist(); notify()
}
export function setExtra(role: string, x: Extra, on: boolean) {
  if (!guard()) return
  roles = roles.map((r) => (r.name === role ? { ...r, extras: on ? [...new Set([...(r.extras ?? []), x])] : (r.extras ?? []).filter((e) => e !== x) } : r))
  log('Access changed', `${role}: ${EXTRAS.find((e) => e.id === x)!.label} turned ${on ? 'on' : 'off'}.`); persist(); notify()
}
export function setTeams(role: string, teams: string[] | null) {
  if (!guard()) return
  roles = roles.map((r) => (r.name === role ? { ...r, teams } : r))
  log('Access changed', `${role}: may take action on ${teams === null ? 'every team' : teams.length ? teams.join(', ') : 'no team'}.`); persist(); notify()
}
export const teamsOf = (role: string) => roleOf(role)?.teams ?? null

/** A team was renamed or deleted (to = null): keep roles that name it in step. */
export function teamChanged(from: string, to: string | null) {
  if (!roles.some((r) => r.teams?.includes(from))) return
  roles = roles.map((r) => (r.teams?.includes(from) ? { ...r, teams: r.teams.flatMap((t) => (t === from ? (to ? [to] : []) : [t])) } : r))
  persist(); notify()
}
