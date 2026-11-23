// Client-side accounts and sign-in. This is a UI gate for a browser-only app: users and password
// hashes live in localStorage, so it is NOT real security. Enforce access on a server before production.
import { useSyncExternalStore } from 'react'
import { setRole } from './store'
import { isOwner, setRemoteRoles } from './rbac'
import { log } from './audit'
import { atlasCall, atlasQuery, atlasReady, setAuthToken } from './atlas'

export interface User {
  id: string; name: string; email: string; role: string; active: boolean; owner?: boolean; mustChange?: boolean
  salt?: string; hash?: string; createdAt: string; lastLogin?: string
}

const KEY = 'offboarding.users.v1'
const SESSION = 'offboarding.session.v1'
export const OWNER_FALLBACK = 'owner@canalsugar.com'
export const DEMO = { email: 'admin@offboard.local', password: 'Admin#123' }

/* ---- hashing ---- */
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
async function hashPw(pw: string, salt: string) {
  const data = new TextEncoder().encode(salt + ':' + pw)
  if (globalThis.crypto?.subtle) return hex(await crypto.subtle.digest('SHA-256', data))
  let h = 2166136261 // insecure origins (plain http on a LAN) have no crypto.subtle: weak fallback
  for (const b of data) h = Math.imul(h ^ b, 16777619)
  return 'f' + (h >>> 0).toString(16)
}
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(12)).buffer as ArrayBuffer)
const newId = () => 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)

/* ---- shared accounts: when the database is set up, sign-in is checked there, so any computer works ---- */
const remote = () => atlasReady()
const TOKEN = 'offboarding.token.v1'
let me: User | null = null // the signed-in person, in shared mode
let ownerDefaultPw = ''
const readToken = () => { try { return sessionStorage.getItem(TOKEN) || localStorage.getItem(TOKEN) } catch { return null } }
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
const api = <T,>(path: string, method = 'GET', body?: unknown) => atlasCall(path + atlasQuery(), { method, body: body === undefined ? undefined : JSON.stringify(body) }) as Promise<T>

async function loadConfig() {
  const c = await api<{ roles?: never[]; defaultPassword?: string }>('/config')
  setRemoteRoles((c.roles ?? []) as never)
  ownerDefaultPw = c.defaultPassword ?? ''
}
/** The Owner's list of everyone (shared mode). Others cannot read it. */
export async function refreshUsers() {
  if (!remote() || !me?.owner) return
  try { users = (await api<{ users: User[] }>('/users')).users; notify() } catch { /* shown on the next action */ }
}
async function refreshMe() {
  const r = await api<{ user: User }>('/auth/me')
  me = r.user; setRole(me.role, !!me.owner); notify()
}

/* ---- store ---- */
let users: User[] = []
let sessionId: string | null = null
let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((f) => f()) }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(users)) } catch { /* ignore */ } }

function readSession() {
  try { return sessionStorage.getItem(SESSION) || localStorage.getItem(SESSION) } catch { return null }
}

export async function initAuth() {
  if (remote()) {
    const t = readToken()
    if (t) {
      setAuthToken(t)
      try { await refreshMe(); await loadConfig() } catch { me = null; setAuthToken('') }
    }
    notify(); return
  }
  try { const raw = localStorage.getItem(KEY); if (raw) users = JSON.parse(raw) } catch { users = [] }
  if (!users.length) {
    // There is no sign-up page. The first account (the Owner) is made here: from .env, with the default password,
    // and the person must choose their own the first time they sign in. The recording build uses the demo account instead.
    const salt = newSalt(), demo = !!import.meta.env.VITE_SEED_DEMO
    users = [{
      id: newId(), name: demo ? 'Administrator' : String(import.meta.env.VITE_OWNER_NAME || 'Owner'),
      email: demo ? DEMO.email : String(import.meta.env.VITE_OWNER_EMAIL || OWNER_FALLBACK).trim().toLowerCase(),
      role: 'Admin', active: true, owner: true, salt, hash: await hashPw(demo ? DEMO.password : getDefaultPassword(), salt),
      mustChange: !demo, createdAt: new Date().toISOString(),
    }]
    persist()
  }
  if (!users.some((u) => u.owner)) { // older installs: the first Admin becomes the Owner
    const first = users.find((u) => u.role === 'Admin' && u.active) ?? users[0]
    if (first) { first.owner = true; persist() }
  }
  const sid = readSession()
  const u = users.find((x) => x.id === sid && x.active)
  sessionId = u ? u.id : null
  if (u) setRole(u.role, !!u.owner)
  notify()
}

export async function verifyPassword(pw: string) {
  if (remote()) {
    if (!me) return false
    const t = me.email
    try { await api('/auth/login', 'POST', { login: t, password: pw }); return true } catch { return false }
  }
  const u = currentUser()
  return !!u && (await hashPw(pw, u.salt ?? '')) === u.hash
}
/* ---- the default password the Owner hands to new people ---- */
const PW_KEY = 'offboarding.defaultpw.v1'
const FALLBACK_PW = 'abd@123456'
export const getDefaultPassword = () => { if (remote()) return ownerDefaultPw || FALLBACK_PW; try { return localStorage.getItem(PW_KEY) || FALLBACK_PW } catch { return FALLBACK_PW } }
export async function setDefaultPassword(pw: string): Promise<string | null> {
  if (!isOwner()) return 'Only the Owner can change this.'
  if (pw.length < 8) return 'The default password needs at least 8 characters.'
  if (remote()) {
    try { await api('/config', 'PUT', { defaultPassword: pw }); ownerDefaultPw = pw } catch (e) { return msgOf(e) }
    log('Default password changed', 'The default password for new people was changed.'); notify(); return null
  }
  try { localStorage.setItem(PW_KEY, pw) } catch { /* ignore */ }
  log('Default password changed', 'The default password for new people was changed.')
  notify(); return null
}

export const allUsers = () => users
export const currentUser = () => (remote() ? me : users.find((u) => u.id === sessionId) ?? null)
export const usesDemoPassword = async () => {
  if (remote()) return false
  const a = users.find((u) => u.email === DEMO.email)
  return !!a && a.hash === (await hashPw(DEMO.password, a.salt ?? ''))
}

export function useAuth() {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => version)
  return { user: currentUser(), users }
}

/* ---- sign in / out ---- */
/** Sign in with the full email, or just the part before the @ ("sara"), or the full name, as long as it points to one person. */
function findByLogin(typed: string) {
  const t = typed.trim().toLowerCase()
  if (!t) return undefined
  const byEmail = users.find((x) => x.email.toLowerCase() === t)
  if (byEmail) return byEmail
  const only = (list: User[]) => (list.length === 1 ? list[0] : undefined)
  return only(users.filter((x) => x.email.toLowerCase().split('@')[0] === t)) ?? only(users.filter((x) => x.name.trim().toLowerCase() === t))
}
let fails = 0
let lockedUntil = 0
export async function login(email: string, password: string, remember: boolean): Promise<string | null> {
  if (remote()) {
    try {
      const r = await api<{ token: string; user: User }>('/auth/login', 'POST', { login: email, password })
      setAuthToken(r.token); me = r.user
      try { (remember ? localStorage : sessionStorage).setItem(TOKEN, r.token) } catch { /* ignore */ }
      setRole(me.role, !!me.owner)
      await loadConfig().catch(() => undefined)
      notify(); log('Signed in', `${me.name} signed in.`); return null
    } catch (e) { return msgOf(e) }
  }
  if (Date.now() < lockedUntil) return `Too many attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)} seconds.`
  const u = findByLogin(email)
  const ok = !!u && u.active && (await hashPw(password, u.salt ?? '')) === u.hash
  if (!ok || !u) {
    if (++fails >= 5) { lockedUntil = Date.now() + 30_000; fails = 0 }
    return u && !u.active ? 'This account is disabled. Ask the Owner.' : 'Name, email or password is incorrect.'
  }
  fails = 0
  u.lastLogin = new Date().toISOString(); persist()
  sessionId = u.id
  try { (remember ? localStorage : sessionStorage).setItem(SESSION, u.id) } catch { /* ignore */ }
  setRole(u.role, !!u.owner); notify()
  log('Signed in', `${u.name} signed in.`)
  return null
}
export function logout() {
  if (remote()) {
    if (me) log('Signed out', `${me.name} signed out.`)
    me = null; users = []; setAuthToken('')
    try { sessionStorage.removeItem(TOKEN); localStorage.removeItem(TOKEN) } catch { /* ignore */ }
    notify(); return
  }
  if (sessionId) log('Signed out', `${currentUser()?.name ?? ''} signed out.`)
  sessionId = null
  try { sessionStorage.removeItem(SESSION); localStorage.removeItem(SESSION) } catch { /* ignore */ }
  notify()
}

/* ---- profile management ---- */
const adminCount = () => users.filter((u) => u.role === 'Admin' && u.active).length

export async function saveUser(d: { id?: string; name: string; email: string; role: string; active: boolean; password?: string }): Promise<string | null> {
  if (!isOwner()) return 'Only the Owner can manage profiles.'
  if (remote()) {
    try {
      if (d.id) await api(`/users/${d.id}`, 'PUT', { name: d.name, email: d.email, role: d.role, active: d.active, password: d.password })
      else await api('/users', 'POST', { name: d.name, email: d.email, role: d.role, active: d.active, password: d.password })
    } catch (e) { return msgOf(e) }
    log(d.id ? 'Profile changed' : 'Profile added', `${d.name.trim()} (${d.email.trim().toLowerCase()}), role ${d.role}${d.active ? '' : ', disabled'}${d.password ? ', password set' : ''}.`)
    await refreshUsers(); return null
  }
  const name = d.name.trim(), email = d.email.trim().toLowerCase()
  if (!name) return 'Enter a name.'
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email address.'
  if (users.some((u) => u.email === email && u.id !== d.id)) return 'Another profile already uses this email.'
  if (!d.id && (d.password ?? '').length < 8) return 'Password needs at least 8 characters.'
  if (d.id && d.password && d.password.length < 8) return 'Password needs at least 8 characters.'
  const existing = d.id ? users.find((u) => u.id === d.id) : undefined
  if (existing?.owner && (!d.active || d.role !== 'Admin')) return 'The Owner keeps an active profile and the Admin role. Transfer ownership first.'
  if (existing && existing.role === 'Admin' && (d.role !== 'Admin' || !d.active) && adminCount() <= 1) return 'Keep at least one active Admin.'
  if (existing) {
    Object.assign(existing, { name, email, role: d.role, active: d.active })
    if (d.password) { existing.salt = newSalt(); existing.hash = await hashPw(d.password, existing.salt); existing.mustChange = true }
    if (existing.id === sessionId) setRole(existing.role, !!existing.owner)
  } else {
    const salt = newSalt()
    users.push({ id: newId(), name, email, role: d.role, active: d.active, salt, hash: await hashPw(d.password!, salt), mustChange: true, createdAt: new Date().toISOString() })
  }
  log(existing ? 'Profile changed' : 'Profile added', `${name} (${email}), role ${d.role}${d.active ? '' : ', disabled'}${d.password ? ', password set' : ''}.`)
  persist(); notify()
  return null
}

export async function deleteUser(id: string): Promise<string | null> {
  if (!isOwner()) return 'Only the Owner can manage profiles.'
  if (remote()) {
    const who = users.find((x) => x.id === id)
    try { await api(`/users/${id}`, 'DELETE') } catch (e) { return msgOf(e) }
    log('Profile deleted', `${who?.name ?? ''} (${who?.email ?? ''}) was deleted.`); await refreshUsers(); return null
  }
  const u = users.find((x) => x.id === id)
  if (!u) return null
  if (u.owner) return 'The Owner cannot be deleted. Transfer ownership first.'
  if (id === sessionId) return 'You cannot delete the profile you are signed in with.'
  if (u.role === 'Admin' && u.active && adminCount() <= 1) return 'Keep at least one active Admin.'
  users = users.filter((x) => x.id !== id); log('Profile deleted', `${u.name} (${u.email}) was deleted.`); persist(); notify()
  return null
}

/** For someone who was given the default password: pick their own, without typing the old one again. */
export async function setFirstPassword(next: string): Promise<string | null> {
  if (remote()) {
    try { await api('/auth/password', 'POST', { next }); await refreshMe() } catch (e) { return msgOf(e) }
    log('Password changed', `${me?.name ?? ''} chose their own password.`); return null
  }
  const u = currentUser()
  if (!u || !u.mustChange) return 'Not needed.'
  if (next.length < 8) return 'New password needs at least 8 characters.'
  if (next === getDefaultPassword()) return 'Choose a password different from the default one.'
  u.salt = newSalt(); u.hash = await hashPw(next, u.salt); u.mustChange = false
  log('Password changed', `${u.name} chose their own password.`); persist(); notify()
  return null
}
export async function changeOwnPassword(current: string, next: string): Promise<string | null> {
  if (remote()) {
    try { await api('/auth/password', 'POST', { current, next }); await refreshMe() } catch (e) { return msgOf(e) }
    log('Password changed', `${me?.name ?? ''} changed their own password.`); return null
  }
  const u = currentUser()
  if (!u) return 'Not signed in.'
  if ((await hashPw(current, u.salt ?? '')) !== u.hash) return 'Current password is incorrect.'
  if (next.length < 8) return 'New password needs at least 8 characters.'
  u.salt = newSalt(); u.hash = await hashPw(next, u.salt); log('Password changed', `${u.name} changed their own password.`); persist(); notify()
  return null
}
export function renameSelf(name: string) {
  if (remote()) { if (me && name.trim()) { me.name = name.trim(); notify(); void api('/auth/profile', 'POST', { name: name.trim() }).catch(() => undefined) } return }
  const u = currentUser()
  if (u && name.trim()) { u.name = name.trim(); persist(); notify() }
}

/** A role was renamed: people holding it keep it under the new name. */
export function renameRole(from: string, to: string) {
  if (remote()) { void api('/roles/rename', 'POST', { from, to }).then(refreshUsers).catch(() => undefined); return }
  let hit = false
  users.forEach((u) => { if (u.role === from) { u.role = to; hit = true } })
  if (!hit) return
  persist()
  const me = currentUser()
  if (me && me.role === to) setRole(to, !!me.owner)
  notify()
}
export const peopleWithRole = (role: string) => users.filter((u) => u.role === role).length

/** The Owner hands ownership to another active profile and becomes a normal Admin. */
export async function transferOwnership(toId: string): Promise<string | null> {
  if (remote()) {
    const to = users.find((u) => u.id === toId)
    try { await api('/users/transfer', 'POST', { toId }) } catch (e) { return msgOf(e) }
    log('Ownership transferred', `${me?.name ?? ''} made ${to?.name ?? ''} the Owner.`)
    await refreshMe().catch(() => undefined); users = []; notify(); return null
  }
  const self = currentUser(), to = users.find((u) => u.id === toId)
  if (!self || !self.owner) return 'Only the Owner can transfer ownership.'
  if (!to || !to.active) return 'Choose an active profile.'
  log('Ownership transferred', `${self.name} made ${to.name} the Owner.`)
  if (to.role !== 'Admin') to.role = 'Admin'
  self.owner = false; to.owner = true
  setRole(self.role, false); persist(); notify()
  return null
}
