// Makes the files that connect Excel to the live app.
//   node scripts/make-live-excel.mjs <gateway address> <REPORT_KEY> [folder]
// Example: node scripts/make-live-excel.mjs https://canal-sugar-offboarding.vercel.app/api my-secret-key live-reports
// Writes one .iqy file per table (double-click: Excel loads it and can refresh every few minutes) and live-reports.pq.txt
// (Power Query code, for people who prefer Data > Get Data > Blank query). Keep these files private: the key is inside.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [base, key, dir = 'live-reports'] = process.argv.slice(2)
if (!base || !key) { console.error('Usage: node scripts/make-live-excel.mjs <gateway address> <REPORT_KEY> [folder]'); process.exit(1) }
const root = base.replace(/\/+$/, '')
const TABLES = { summary: 'Summary', cases: 'All cases', tasks: 'All tasks', teams: 'Team performance' }
mkdirSync(dir, { recursive: true })

for (const [t, label] of Object.entries(TABLES)) {
  writeFileSync(join(dir, `${label}.iqy`), `WEB\r\n1\r\n${root}/report/data?table=${t}&format=html&key=${encodeURIComponent(key)}\r\n`)
}
const m = Object.entries(TABLES).map(([t, label]) => `// ${label}: Data > Get Data > From Other Sources > Blank Query > Advanced Editor, paste, then Close & Load.
let
    Source = Csv.Document(Web.Contents("${root}/report/data", [Query = [table = "${t}", format = "csv", key = "${key}"]]), [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Table = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
in
    Table
`).join('\n')
writeFileSync(join(dir, 'live-reports.pq.txt'), m)
console.log(`Wrote ${Object.keys(TABLES).length} .iqy files and live-reports.pq.txt in ${dir}/`)
