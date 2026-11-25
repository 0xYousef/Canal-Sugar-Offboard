// Live report tables for Excel (and anything else that can read a web address).
//   GET /report/data?table=cases|tasks|teams|summary&format=csv|json|html&key=<REPORT_KEY>
// The tables come from the same engine the website uses (report-data.mjs, built with `npm run build:gateway`),
// so the numbers match the app. The key is the REPORT_KEY setting of the gateway; without it the link is switched off.
import { timingSafeEqual } from 'node:crypto'
import { buildReport } from './report-data.mjs'

const ZONE = process.env.APP_TZ || 'Africa/Cairo'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) }
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const csvCell = (v) => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t) && Number.isNaN(Number(t))) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t }

export function makeReport(db, base) {
  const C = db.collection(base + '_live')
  return async function handle(req, u) {
    const want = process.env.REPORT_KEY
    if (!want) return [503, 'text/plain', 'Live reports are switched off. Set REPORT_KEY on the gateway.']
    const key = u.searchParams.get('key') ?? req.headers['x-report-key'] ?? ''
    if (!same(key, want)) return [401, 'text/plain', 'Wrong report key.']
    const table = u.searchParams.get('table') || 'cases', format = u.searchParams.get('format') || 'csv'

    const cfg = (await C.findOne({ _id: 'cfg' }))?.data
    if (!cfg) return [404, 'text/plain', 'No sheet is loaded yet.']
    const docs = await C.find({ lid: { $exists: true }, deleted: { $ne: true } }).toArray()
    const state = { version: 1, ...cfg, leavers: docs.map((d) => ({ id: d.lid, values: d.values ?? {}, tasks: d.tasks ?? {} })) }
    state.settings = { ...state.settings, reportDate: today() }   // "today" in the company time zone, not the server's
    const out = buildReport(state, today())
    const rows = out.tables[table]
    if (!rows) return [400, 'text/plain', 'Unknown table. Use cases, tasks, teams or summary.']

    if (format === 'json') {
      const [head, ...body] = rows
      return [200, 'application/json', JSON.stringify({ updated: out.updated, rows: body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) })]
    }
    if (format === 'html') {
      const [head, ...body] = rows
      return [200, 'text/html; charset=utf-8', `<!doctype html><meta charset="utf-8"><title>${esc(table)}</title><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`]
    }
    return [200, 'text/csv; charset=utf-8', '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')]
  }
}
