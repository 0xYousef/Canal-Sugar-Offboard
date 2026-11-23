// Accounts, roles and sign-in, kept in MongoDB so everyone signs in with the same details from any computer.
// Passwords are stored with scrypt (slow, salted) and never leave the server.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const hashPw = async (pw) => { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${(await scryptAsync(pw, salt, 64)).toString('hex')}` }
const checkPw = async (pw, stored) => {
  const [, salt, hex] = String(stored).split('$')
  if (!salt || !hex) return false
  const got = await scryptAsync(pw, salt, 64), want = Buffer.from(hex, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

const SECRET = process.env.SESSION_SECRET || process.env.API_KEY
const HOURS = Number(process.env.SESSION_HOURS || 12)
const sign = (uid) => { const p = Buffer.from(JSON.stringify({ uid, exp: Date.now() + HOURS * 3600e3 })).toString('base64url'); return p + '.' + createHmac('sha256', SECRET).update(p).digest('base64url') }
const verify = (t) => {
  const [p, sig] = String(t ?? '').split('.')
  if (!p || !sig) return null
  const want = createHmac('sha256', SECRET).update(p).digest('base64url')
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp > Date.now() ? d : null } catch { return null }
}

const pub = (d) => ({ id: d._id, name: d.name, email: d.email, role: d.role, active: d.active, owner: !!d.owner, mustChange: !!d.mustChange, createdAt: d.createdAt, lastLogin: d.lastLogin })
const newId = () => 'u' + Date.now().toString(36) + randomBytes(3).toString('hex')
const EMAIL = /^\S+@\S+\.\S+$/
const seeding = new Map() // the seed job in flight for a database+collection, shared by requests that arrive together
const fails = new Map() // login attempts per address+name: 5 wrong answers lock it for 30 seconds

export function makeAccounts(db, base) {
  const U = db.collection(base + '_users'), C = db.collection(base + '_config')
  const cfg = async () => (await C.findOne({ _id: 'config' })) ?? { _id: 'config', defaultPassword: process.env.DEFAULT_PASSWORD || 'abd@123456', roles: [] }
  const saveCfg = (c) => C.replaceOne({ _id: 'config' }, c, { upsert: true })

  /** Creates the Owner once. Safe when several requests arrive together: email is unique and the insert is an upsert. */
  function seed() {
    const key = db.databaseName + '/' + base
    if (!seeding.has(key)) seeding.set(key, (async () => {
      await U.createIndex({ email: 1 }, { unique: true })
      if (await U.estimatedDocumentCount() > 0) return
      const c = await cfg()
      const email = (process.env.OWNER_EMAIL || 'owner@canalsugar.com').trim().toLowerCase()
      await U.updateOne({ email }, { $setOnInsert: {
        _id: newId(), name: process.env.OWNER_NAME || 'Owner', email,
        role: 'Admin', active: true, owner: true, mustChange: true, pass: await hashPw(c.defaultPassword), createdAt: new Date().toISOString(),
      } }, { upsert: true })
    })().finally(() => seeding.delete(key)))
    return seeding.get(key)
  }
  const activeAdmins = () => U.countDocuments({ role: 'Admin', active: true })
  const me = async (req) => {
    const t = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''))
    const d = t && (await U.findOne({ _id: t.uid }))
    return d && d.active ? d : null
  }
  const findLogin = async (typed) => {
    const t = typed.trim().toLowerCase()
    if (!t) return null
    const all = await U.find({}).toArray()
    const one = (l) => (l.length === 1 ? l[0] : null)
    return all.find((x) => x.email === t) ?? one(all.filter((x) => x.email.split('@')[0] === t)) ?? one(all.filter((x) => x.name.trim().toLowerCase() === t))
  }

  /** Returns [status, body] or null when the path is not ours. */
  return async function handle(req, u, b, ip) {
    const path = u.pathname, m = req.method
    if (!/^\/(auth|users|config|roles)(\/|$)/.test(path)) return null
    await seed()
    const err = (s, e) => [s, { error: e }]

    if (path === '/auth/login' && m === 'POST') {
      const key = ip + '|' + String(b.login ?? '').toLowerCase()
      const f = fails.get(key)
      if (f && f.until > Date.now()) return err(429, `Too many attempts. Try again in ${Math.ceil((f.until - Date.now()) / 1000)} seconds.`)
      const d = await findLogin(String(b.login ?? ''))
      const ok = !!d && d.active && (await checkPw(String(b.password ?? ''), d.pass))
      if (!ok) {
        const n = (f?.n ?? 0) + 1
        fails.set(key, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 30_000 : 0 })
        return err(401, d && !d.active ? 'This account is disabled. Ask the Owner.' : 'Name, email or password is incorrect.')
      }
      fails.delete(key)
      const lastLogin = new Date().toISOString()
      await U.updateOne({ _id: d._id }, { $set: { lastLogin } })
      return [200, { token: sign(d._id), user: pub({ ...d, lastLogin }) }]
    }

    const user = await me(req)
    if (!user) return err(401, 'Sign in again.')
    const owner = !!user.owner

    if (path === '/auth/me' && m === 'GET') return [200, { user: pub(user) }]
    if (path === '/auth/profile' && m === 'POST') {
      const name = String(b.name ?? '').trim()
      if (!name) return err(400, 'Enter a name.')
      await U.updateOne({ _id: user._id }, { $set: { name } }); return [200, { ok: true }]
    }
    if (path === '/auth/password' && m === 'POST') {
      const next = String(b.next ?? '')
      if (next.length < 8) return err(400, 'New password needs at least 8 characters.')
      if (user.mustChange) { if (next === (await cfg()).defaultPassword) return err(400, 'Choose a password different from the default one.') }
      else if (!(await checkPw(String(b.current ?? ''), user.pass))) return err(400, 'Current password is incorrect.')
      await U.updateOne({ _id: user._id }, { $set: { pass: await hashPw(next), mustChange: false } }); return [200, { ok: true }]
    }
    if (path === '/config' && m === 'GET') { const c = await cfg(); return [200, { roles: c.roles ?? [], defaultPassword: owner ? c.defaultPassword : undefined }] }

    // everything below is Owner only
    if (!owner) return err(403, 'Only the Owner can do that.')
    if (path === '/config' && m === 'PUT') {
      const c = await cfg()
      if (Array.isArray(b.roles)) c.roles = b.roles.slice(0, 100)
      if (typeof b.defaultPassword === 'string') { if (b.defaultPassword.length < 8) return err(400, 'The default password needs at least 8 characters.'); c.defaultPassword = b.defaultPassword }
      await saveCfg(c); return [200, { ok: true }]
    }
    if (path === '/roles/rename' && m === 'POST') {
      const c = await cfg()
      c.roles = (c.roles ?? []).map((r) => (r.name === b.from ? { ...r, name: b.to } : r)); await saveCfg(c)
      await U.updateMany({ role: b.from }, { $set: { role: b.to } }); return [200, { ok: true }]
    }
    if (path === '/users' && m === 'GET') return [200, { users: (await U.find({}).sort({ createdAt: 1 }).toArray()).map(pub) }]
    if (path === '/users/transfer' && m === 'POST') {
      const to = await U.findOne({ _id: b.toId })
      if (!to || !to.active) return err(400, 'Choose an active profile.')
      await U.updateOne({ _id: to._id }, { $set: { owner: true, role: 'Admin' } }); await U.updateOne({ _id: user._id }, { $set: { owner: false } }); return [200, { ok: true }]
    }
    if (path === '/users' && m === 'POST') {
      const name = String(b.name ?? '').trim(), email = String(b.email ?? '').trim().toLowerCase(), pw = String(b.password ?? '')
      if (!name) return err(400, 'Enter a name.')
      if (!EMAIL.test(email)) return err(400, 'Enter a valid email address.')
      if (pw.length < 8) return err(400, 'Password needs at least 8 characters.')
      if (await U.findOne({ email })) return err(400, 'Another profile already uses this email.')
      const d = { _id: newId(), name, email, role: String(b.role || 'Admin'), active: b.active !== false, owner: false, mustChange: true, pass: await hashPw(pw), createdAt: new Date().toISOString() }
      await U.insertOne(d); return [200, { user: pub(d) }]
    }
    const one = path.match(/^\/users\/([\w-]+)$/)
    if (one && m === 'PUT') {
      const d = await U.findOne({ _id: one[1] })
      if (!d) return err(404, 'Not found.')
      const name = String(b.name ?? '').trim(), email = String(b.email ?? '').trim().toLowerCase(), role = String(b.role || d.role), active = b.active !== false
      if (!name) return err(400, 'Enter a name.')
      if (!EMAIL.test(email)) return err(400, 'Enter a valid email address.')
      if (await U.findOne({ email, _id: { $ne: d._id } })) return err(400, 'Another profile already uses this email.')
      if (d.owner && (!active || role !== 'Admin')) return err(400, 'The Owner keeps an active profile and the Admin role. Transfer ownership first.')
      if (d.role === 'Admin' && (role !== 'Admin' || !active) && (await activeAdmins()) <= 1) return err(400, 'Keep at least one active Admin.')
      const set = { name, email, role, active }
      if (b.password) { if (String(b.password).length < 8) return err(400, 'Password needs at least 8 characters.'); set.pass = await hashPw(String(b.password)); set.mustChange = true }
      await U.updateOne({ _id: d._id }, { $set: set }); return [200, { ok: true }]
    }
    if (one && m === 'DELETE') {
      const d = await U.findOne({ _id: one[1] })
      if (!d) return [200, { ok: true }]
      if (d.owner) return err(400, 'The Owner cannot be deleted. Transfer ownership first.')
      if (d._id === user._id) return err(400, 'You cannot delete the profile you are signed in with.')
      if (d.role === 'Admin' && d.active && (await activeAdmins()) <= 1) return err(400, 'Keep at least one active Admin.')
      await U.deleteOne({ _id: d._id }); return [200, { ok: true }]
    }
    return err(404, 'Not found.')
  }
}

/** The signed-in, active person behind a request, or null. Used by the live-sheet endpoints. */
export async function authUser(db, base, req) {
  const t = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''))
  const d = t && (await db.collection(base + '_users').findOne({ _id: t.uid }))
  return d && d.active ? d : null
}
