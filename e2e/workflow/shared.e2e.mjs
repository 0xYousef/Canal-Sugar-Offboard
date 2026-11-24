// End-to-end test against the shared database (gateway + MongoDB): action progress must survive a reload.
//   gateway:  cd gateway && MONGODB_URI=mongodb://127.0.0.1:27019 DB_NAME=e2etest API_KEY=e2ekey ALLOWED_ORIGIN=http://localhost:5198 PORT=8790 OWNER_EMAIL=e2e@test.com DEFAULT_PASSWORD='E2e#Pass123' node server.mjs
//   website:  VITE_DB_URL=http://localhost:8790 VITE_DB_KEY=e2ekey npx vite --port 5198 --strictPort
//   run:      BASE=http://localhost:5198 CHROME=/usr/bin/google-chrome node e2e/workflow/shared.e2e.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:5198'
const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../samples/sample-leavers.xlsx')
const results = []
const ok = (cond, name, extra = '') => { results.push({ cond: !!cond, name, extra }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra ? '  -> ' + extra : ''}`) }
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
const wait = (ms = 400) => page.waitForTimeout(ms)
const dock = async (n) => { await page.getByRole('button', { name: n, exact: true }).click(); await wait(800) }
const choose = async (trigger, option, scope = page) => { await scope.locator(`button:has-text("${trigger}")`).first().click(); await page.getByRole('option', { name: option, exact: true }).click(); await wait(250) }
const row = (leaver, step) => page.locator('tr', { hasText: leaver }).filter({ hasText: step }).first()
const search = async (t) => { await page.getByLabel('Search').fill(t); await wait(500) }
const login = async () => {
  await page.goto(BASE)
  await page.getByLabel('Email or username').fill('e2e@test.com')
  await page.locator('input[type=password]').fill(process.env.PW || 'E2e#Pass123')
  await page.getByRole('button', { name: 'Sign in' }).click(); await wait(2500)
  if (await page.getByText('Choose your own password').isVisible().catch(() => false)) {
    await page.getByLabel('New password (8+ characters)').fill('E2e#Pass456'); await page.getByLabel('Repeat the new password').fill('E2e#Pass456')
    await page.getByRole('button', { name: 'Save password' }).click(); await wait(1200)
  }
  if (await page.getByText('I have read these rules').isVisible().catch(() => false)) {
    await page.getByText('I have read these rules').click(); await page.getByRole('button', { name: 'Continue to the portal' }).click(); await wait(800)
  }
}
await login()
ok(await page.getByText('Welcome,').count() + await page.getByText('Good ').count() > 0, 'signed in to the shared database')
if (await page.locator('input[type=file]').count()) {
  await page.locator('input[type=file]').setInputFiles(SAMPLE); await wait(1500)
  await page.getByRole('button', { name: /^Import \d+ rows/ }).click(); await wait(2500)
}
// actions, saved to the server
await dock('Settings'); await page.getByText('Workflow', { exact: true }).first().click(); await wait(600)
await page.getByRole('button', { name: 'Edit actions' }).click(); await wait(300)
for (const [i, n] of [[1, 'Done'], [2, 'Approve']]) { await page.getByRole('button', { name: 'Add action' }).click(); await wait(250); await page.getByLabel(`Name of action ${i}`).fill(n); await page.getByLabel(`Name of action ${i}`).blur() }
await page.getByRole('button', { name: 'Save changes' }).click(); await wait(800)
await page.getByRole('tab', { name: 'SLA workflow' }).click(); await wait(500)
await page.getByRole('button', { name: 'Edit SLA workflow' }).click(); await wait(300)
await page.getByRole('button', { name: 'Configure' }).first().click(); await wait(400)
await choose('Choose an action', 'Approve', page.locator('[role=dialog]'))
await choose('Choose an action', 'Done', page.locator('[role=dialog]'))
await page.getByRole('button', { name: 'Done', exact: true }).last().click(); await wait(400)
await page.getByRole('button', { name: 'Save changes' }).click(); await wait(3000)
// take the first action, then reload: it must still be there
await dock('Tasks'); await search('Khaled')
await row('Khaled Mansour', 'HR-01').getByRole('button', { name: /Take action|Change/ }).click(); await wait(300)
await page.getByRole('menuitem', { name: /^Approve/ }).click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Save', exact: true }).click(); await wait(500)
ok(/1 of 2 actions/.test(await row('Khaled Mansour', 'HR-01').innerText()), '1. one of two actions is recorded')
await wait(4500)                                   // let the change reach the server and come back on the next refresh
const synced = /1 of 2 actions/.test(await row('Khaled Mansour', 'HR-01').innerText())
ok(synced, '2. it is still recorded after the next sync with the server (not wiped back)')
await page.reload(); await wait(3500)
await dock('Tasks'); await search('Khaled')
const afterReload = await row('Khaled Mansour', 'HR-01').innerText().catch(() => '')
ok(/1 of 2 actions/.test(afterReload), '3. it is still recorded after reloading the page (read back from the database)', afterReload.replace(/\n/g, ' | '))
// finish it
await row('Khaled Mansour', 'HR-01').getByRole('button', { name: /Take action|Change/ }).click(); await wait(300)
await page.getByRole('menuitem', { name: /Done/ }).first().click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Save', exact: true }).click(); await wait(800)
ok(await row('Khaled Mansour', 'HR-01').count() === 0, '4. the second action finishes the task')
await wait(4500); await page.reload(); await wait(3500)
await dock('Tasks'); await search('Khaled')
ok(await row('Khaled Mansour', 'HR-01').count() === 0, '5. the finished task is still finished after a reload')
await browser.close()
const failed = results.filter((r) => !r.cond)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
