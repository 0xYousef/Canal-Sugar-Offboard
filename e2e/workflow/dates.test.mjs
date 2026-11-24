// Checks that weekends and holidays never count toward an SLA: deadlines never land on them, and being "late" is counted in working days.
//   node --experimental-strip-types e2e/workflow/dates.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

// dates.ts has no dependencies, so Node can run it directly (Node 22.6+ strips the types).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { calendar } = await import(pathToFileURL(path.join(root, 'src/lib/dates.ts')).href)

let bad = 0
const eq = (got, want, name) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

const dow = (s) => new Date(s + 'T12:00:00Z').getUTCDay()
eq(dow('2026-11-19'), 4, 'sanity: 19 Nov 2026 is a Thursday')

const FS = calendar({ weekend: 'FS', holidays: [] })     // Friday + Saturday off
eq([FS.wdDiff('2026-11-20', '2026-11-19'), FS.wdDiff('2026-11-21', '2026-11-19')], [0, 0], 'Friday and Saturday after a Thursday deadline are 0 working days late')
eq(FS.wdDiff('2026-11-22', '2026-11-19'), 1, 'Sunday is the first working day late')
eq(FS.wdDiff('2026-11-23', '2026-11-19'), 2, 'Monday is the second')
eq(FS.wdDiff('2026-11-19', '2026-11-23'), -2, 'it counts the other way round too')
eq(FS.toWorking('2026-11-20', 1), '2026-11-22', 'a deadline on a Friday moves to the next working day (Sunday)')
eq(FS.toWorking('2026-11-21', -1), '2026-11-19', 'a "before" deadline on a Saturday moves back to Thursday')
eq(FS.toWorking('2026-11-19', 1), '2026-11-19', 'a working day stays put')
eq(FS.addWD('2026-11-19', 1, 1), '2026-11-22', '1 working day after Thursday is Sunday (weekend skipped)')

const SS = calendar({ weekend: 'SS', holidays: [] })     // Saturday + Sunday off
eq([SS.wdDiff('2026-11-21', '2026-11-20'), SS.wdDiff('2026-11-22', '2026-11-20'), SS.wdDiff('2026-11-23', '2026-11-20')], [0, 0, 1], 'Saturday-Sunday weekend: only Monday counts after a Friday deadline')

const H = calendar({ weekend: 'SS', holidays: [{ date: '2026-11-23', name: 'Holiday' }] })
eq(H.wdDiff('2026-11-24', '2026-11-20'), 1, 'a holiday adds nothing either')
eq(H.toWorking('2026-11-23', 1), '2026-11-24', 'a deadline on a holiday moves on')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
