// The gateway's request handler, shared by the always-on server (server.mjs) and the Vercel function (../api).
import { MongoClient } from 'mongodb'
import { makeAccounts } from './accounts.mjs'
import { makeLive } from './live.mjs'

const { MONGODB_URI, API_KEY, ALLOWED_ORIGIN = '' } = process.env
const ORIGINS = ALLOWED_ORIGIN.split(',').map((x) => x.trim()).filter(Boolean) // several addresses can be allowed, comma separated

let clientP
export const getClient = () => {
  if (!MONGODB_URI || !API_KEY) throw new Error('Set MONGODB_URI and API_KEY first (see README.md).')
  // One connection per process, reused by every request (important on serverless hosts).
  return (clientP ??= new MongoClient(MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect().catch((e) => { clientP = undefined; throw e }))
}

const name = (v, d) => (/^[\w.-]{1,60}$/.test(v ?? '') ? v : d)
const send = (res, code, body, origin) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'content-type,x-api-key,authorization',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    Vary: 'Origin',
  })
  res.end(JSON.stringify(body))
}
const body = (req) => new Promise((ok, no) => {
  if (req.body !== undefined && req.body !== null) { // Vercel has already read the body
    if (typeof req.body === 'string') { try { return ok(JSON.parse(req.body || '{}')) } catch (e) { return no(e) } }
    return ok(Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString() || '{}') : req.body)
  }
  let n = 0; const parts = []
  req.on('data', (c) => { n += c.length; if (n > 20e6) { no(new Error('Too large')); req.destroy() } else parts.push(c) })
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString() || '{}')) } catch (e) { no(e) } })
})

export async function handler(req, res) {
  const origin = req.headers.origin ?? ''
  { // on Vercel the gateway lives under /api: vercel.json passes the real path as ?__p=
    const q = new URL(req.url, 'http://x'), p = q.searchParams.get('__p')
    if (p !== null) { q.searchParams.delete('__p'); q.searchParams.delete('path'); req.url = '/' + p + q.search }
    else req.url = req.url.replace(/^\/api(?=\/|\?|$)/, '') || '/'
  }
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin)
  if (req.url.split('?')[0] === '/healthz') return send(res, 200, { ok: true }, origin)   // for the host's health check: no key, no data
  if (req.url.split('?')[0] === '/cron/purge') { // Vercel Cron: only removes a sheet whose closing time has passed, returns nothing
    try { const c = await getClient(); await makeLive(c.db(process.env.DB_NAME || 'offboarding'), process.env.DB_COLLECTION || 'app_state').purgeIfDue(); return send(res, 200, { ok: true }, origin) } catch (e) { return send(res, 500, { error: e.message }, origin) }
  }
  if (req.headers['x-api-key'] !== API_KEY) return send(res, 401, { error: 'Wrong access key.' }, origin)
  const u = new URL(req.url, 'http://x')
  const client = await getClient().catch(() => null)
  if (!client) return send(res, 500, { error: 'Cannot reach MongoDB Atlas. Check MONGODB_URI and Network Access.' }, origin)
  const db = client.db(name(u.searchParams.get('database'), 'offboarding'))
  const col = db.collection(name(u.searchParams.get('collection'), 'app_state'))
  try {
    if (u.pathname === '/health') { await db.command({ ping: 1 }); return send(res, 200, { ok: true, database: db.databaseName }, origin) }
    if (u.pathname === '/state' && req.method === 'GET') {
      const d = await col.findOne({ _id: 'state' })
      return send(res, 200, d ? { state: d.state, savedAt: d.savedAt } : {}, origin)
    }
    if (u.pathname === '/state' && req.method === 'PUT') {
      const { state } = await body(req)
      if (!state || !Array.isArray(state.leavers) || !Array.isArray(state.steps)) return send(res, 400, { error: 'That is not an Offboarding backup.' }, origin)
      const savedAt = new Date().toISOString()
      await col.replaceOne({ _id: 'state' }, { _id: 'state', state, savedAt }, { upsert: true })
      return send(res, 200, { ok: true, savedAt }, origin)
    }
    // The shared live sheet
    if (/^\/live(\/|$)/.test(u.pathname)) {
      const live = makeLive(db, name(u.searchParams.get('collection'), 'app_state'))
      const [code, out] = await live.handle(req, u, req.method === 'GET' ? {} : await body(req))
      return send(res, code, out, origin)
    }
    // Accounts, roles and sign-in
    if (/^\/(auth|users|config|roles)(\/|$)/.test(u.pathname)) {
      const handle = makeAccounts(db, name(u.searchParams.get('collection'), 'app_state'))
      const [code, out] = await handle(req, u, req.method === 'GET' || req.method === 'DELETE' ? {} : await body(req), String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim())
      return send(res, code, out, origin)
    }
    // Activity log: one document per entry, in "<collection>_log"
    if (u.pathname === '/logs') {
      const logs = db.collection(name(u.searchParams.get('collection'), 'app_state') + '_log')
      if (req.method === 'POST') {
        const { entries } = await body(req)
        if (!Array.isArray(entries) || entries.length > 500 || entries.some((e) => !e || typeof e.id !== 'string')) return send(res, 400, { error: 'Bad log entries.' }, origin)
        if (entries.length) await logs.bulkWrite(entries.map((e) => ({ updateOne: { filter: { _id: e.id }, update: { $setOnInsert: { _id: e.id, ...e } }, upsert: true } })))
        return send(res, 200, { ok: true, saved: entries.length }, origin)
      }
      if (req.method === 'GET') {
        const found = await logs.find({}).sort({ at: -1 }).limit(20000).toArray()
        return send(res, 200, { entries: found.map(({ _id, ...e }) => e) }, origin)
      }
      if (req.method === 'DELETE') { const r = await logs.deleteMany({}); return send(res, 200, { ok: true, deleted: r.deletedCount }, origin) }
    }
    send(res, 404, { error: 'Not found.' }, origin)
  } catch (e) { send(res, 500, { error: 'Atlas said: ' + e.message }, origin) }
}
