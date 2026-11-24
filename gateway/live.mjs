// The shared, live sheet. Everyone signed in works on the same leavers; every change is saved here and the
// other computers pick it up within a few seconds. At the closing time set in Settings the whole sheet is
// removed from the server, and the next day starts with an empty one.
//
// Collection "<collection>_live": one "meta" document (counters, closing time, shared settings) and one
// document per leaver. Every write gets a higher "rev" number, so a computer asks only for what is newer.
import { authUser } from './accounts.mjs'

const KEY = /^[\w-]{1,80}$/
const known = new Map() // "db|collection" -> { db, base }: every sheet that has been used, checked by the timer

// The closing time is read in this time zone (serverless hosts run on UTC, so it is set here, not by TZ).
const ZONE = process.env.APP_TZ || 'Africa/Cairo'
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const clock = () => {
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60 }
}
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
const GOOD_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function makeLive(db, base) {
  const C = db.collection(base + '_live')
  const meta = async () => (await C.findOne({ _id: 'meta' })) ?? { _id: 'meta', rev: 0, epoch: 1, cfgRev: 0, enabled: false, endTime: '18:00', lastPurge: '' }
  const bump = async (n = 1) => { const d = await C.findOneAndUpdate({ _id: 'meta' }, { $inc: { rev: n }, $setOnInsert: { epoch: 1, cfgRev: 0, enabled: false, endTime: '18:00', lastPurge: '' } }, { upsert: true, returnDocument: 'after' }); return d.rev }
  known.set(db.databaseName + '|' + base, { db, base })

  async function purge(by) {
    const gone = await C.deleteMany({ lid: { $exists: true } })
    const rev = await bump()
    await C.updateOne({ _id: 'meta' }, { $inc: { epoch: 1 }, $set: { lastPurge: clock().date, sheet: null, purgedAt: new Date().toISOString() } })
    await db.collection(base + '_log').insertOne({
      _id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), id: '', at: new Date().toISOString(),
      agent: by, agentEmail: '', role: '', employee: '', action: 'Shared file removed', details: `The shared sheet (${gone.deletedCount} leavers) was removed from the server.`,
    }).catch(() => undefined)
    return rev
  }
  /** Removes the sheet if its closing time has passed today. The claim is atomic, so only one request does it. */
  async function purgeIfDue() {
    const now = clock(), m = await C.findOne({ _id: 'meta' })
    if (!m?.enabled || m.lastPurge === now.date || now.min < toMin(m.endTime)) return false
    const won = await C.findOneAndUpdate({ _id: 'meta', enabled: true, lastPurge: { $ne: now.date } }, { $set: { lastPurge: now.date } })
    if (!won) return false
    await purge('System'); return true
  }
  const publicMeta = (m) => ({ rev: m.rev, epoch: m.epoch, endTime: m.endTime, enabled: !!m.enabled, nowMin: clock().min, sheet: m.sheet ?? null, purgedAt: m.purgedAt ?? null })

  async function handle(req, u, b) {
    const user = await authUser(db, base, req)
    if (!user) return [401, { error: 'Sign in again.' }]
    await purgeIfDue()   // no background timer on serverless hosts: the first request after closing time removes the sheet
    const path = u.pathname, admin = user.owner || user.role === 'Admin'
    const m = await meta()

    if (path === '/live' && req.method === 'GET') {
      let since = Number(u.searchParams.get('since')) || 0
      const reset = Number(u.searchParams.get('epoch')) !== m.epoch
      if (reset) since = 0
      const docs = await C.find({ lid: { $exists: true }, rev: { $gt: since } }).toArray()
      const out = { ...publicMeta(m), reset, leavers: docs.map((d) => ({ id: d.lid, values: d.values ?? {}, tasks: d.tasks ?? {}, deleted: !!d.deleted })).filter((d) => !(reset && d.deleted)) }
      if (reset || m.cfgRev > since) out.cfg = (await C.findOne({ _id: 'cfg' }))?.data ?? null
      return [200, out]
    }
    if (path === '/live' && req.method === 'POST') {
      const changes = Array.isArray(b.changes) ? b.changes : []
      if (changes.length > 2000) return [400, { error: 'Too many changes at once.' }]
      const ops = []
      let top = changes.length + (b.cfg ? 1 : 0) + (b.sheet ? 1 : 0)
      const last = top ? await bump(top) : m.rev
      let rev = last - top
      for (const c of changes) {
        if (!c || !KEY.test(c.id ?? '')) continue
        rev++
        if (c.del) { ops.push({ updateOne: { filter: { _id: 'l:' + c.id }, update: { $set: { lid: c.id, deleted: true, values: {}, tasks: {}, rev } }, upsert: true } }); continue }
        const $set = { lid: c.id, deleted: false, rev }, $unset = {}
        for (const [k, v] of Object.entries(c.values ?? {})) { if (!KEY.test(k)) continue; if (v === null) $unset['values.' + k] = ''; else $set['values.' + k] = String(v) }
        for (const [k, v] of Object.entries(c.tasks ?? {})) { if (!KEY.test(k)) continue; if (v === null) $unset['tasks.' + k] = ''; else $set['tasks.' + k] = v }
        const update = { $set }
        if (Object.keys($unset).length) update.$unset = $unset
        ops.push({ updateOne: { filter: { _id: 'l:' + c.id }, update, upsert: true } })
      }
      if (ops.length) await C.bulkWrite(ops, { ordered: true })
      if (b.cfg && typeof b.cfg === 'object') {
        rev++
        await C.updateOne({ _id: 'cfg' }, { $set: { data: b.cfg } }, { upsert: true })
        await C.updateOne({ _id: 'meta' }, { $set: { cfgRev: rev } })
      }
      if (b.sheet && typeof b.sheet.name === 'string') await C.updateOne({ _id: 'meta' }, { $set: { sheet: { name: b.sheet.name.slice(0, 200), by: user.name, at: new Date().toISOString() } } })
      return [200, { ok: true, rev: last }]
    }
    if (path === '/live/settings' && req.method === 'POST') {
      if (!admin) return [403, { error: 'Only the Owner or an Admin can change the closing time.' }]
      if (!GOOD_TIME.test(String(b.endTime))) return [400, { error: 'Enter the time as HH:MM, for example 18:00.' }]
      const enabled = !!b.enabled, now = clock()
      // Turning it on after today's closing time must not wipe the sheet straight away: the first removal is tomorrow.
      const lastPurge = enabled && now.min >= toMin(b.endTime) ? now.date : m.lastPurge
      await C.updateOne({ _id: 'meta' }, { $set: { endTime: b.endTime, enabled, lastPurge }, $setOnInsert: { rev: 0, epoch: 1, cfgRev: 0 } }, { upsert: true })
      return [200, { ok: true }]
    }
    if (path === '/live/purge' && req.method === 'POST') {
      if (!admin) return [403, { error: 'Only the Owner or an Admin can remove the file.' }]
      await purge(user.name)
      return [200, { ok: true }]
    }
    return [404, { error: 'Not found.' }]
  }
  return { handle, purge, purgeIfDue }
}

/** Once a day, at the closing time, remove the sheet. Checked every 20 seconds for every sheet in use. */
export function startPurgeTimer() {
  setInterval(async () => {
    for (const { db, base } of known.values()) {
      try {
        const live = makeLive(db, base)
        const m = await db.collection(base + '_live').findOne({ _id: 'meta' })
        const now = clock()
        if (m?.enabled && m.lastPurge !== now.date && now.min >= toMin(m.endTime)) { await live.purge('System'); console.log('Removed the shared file at', m.endTime) }
      } catch (e) { console.error('Purge check failed:', e.message) }
    }
  }, 20_000).unref?.()
}
