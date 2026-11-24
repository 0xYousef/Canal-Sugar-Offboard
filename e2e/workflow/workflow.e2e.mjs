// End-to-end test of Workflow: your own actions, finishing / non-finishing actions, SLA workflow, "waits for", edit mode and saved data.
// Run against a demo build of the app:
//   VITE_SEED_DEMO=1 VITE_DB_URL= VITE_DB_KEY= npx vite --port 5199 --strictPort &
//   BASE=http://localhost:5199 CHROME=/usr/bin/google-chrome node e2e/workflow/workflow.e2e.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:5199'
const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../samples/sample-leavers.xlsx')
const results = []
const ok = (cond, name, extra = '') => { results.push({ cond: !!cond, name, extra }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra ? '  -> ' + extra : ''}`) }

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const wait = (ms = 350) => page.waitForTimeout(ms)
const dock = async (n) => { await page.getByRole('button', { name: n, exact: true }).click(); await wait(700) }
const choose = async (triggerText, option, scope = page) => { await scope.locator(`button:has-text("${triggerText}")`).first().click(); await page.getByRole('option', { name: option, exact: true }).click(); await wait(250) }
const row = (leaver, step) => page.locator('tr', { hasText: leaver }).filter({ hasText: step }).first()
const takeAction = (leaver, step) => row(leaver, step).getByRole('button', { name: /Take action|Change/ })
const openMenu = async (leaver, step) => { await takeAction(leaver, step).click(); await wait(300) }
const menuItems = async () => page.getByRole('menuitem').evaluateAll((els) => els.map((e) => { const c = e.cloneNode(true); c.querySelectorAll('[aria-hidden=true]').forEach((n) => n.remove()); return c.textContent.replace(/\s+/g, ' ').trim() }))
const closeMenu = async () => { await page.keyboard.press('Escape'); await wait(200) }
const search = async (t) => { await page.getByLabel('Search').fill(t); await wait(400) }
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('offboarding.codebase.v2') || '{}'))

// ---------- sign in, import the sample leavers ----------
await page.goto(BASE)
await page.getByLabel('Email or username').fill('admin@offboard.local')
await page.locator('input[type=password]').fill('Admin#123')
await page.getByRole('button', { name: 'Sign in' }).click(); await wait(2000)
if (await page.getByText('Choose your own password').isVisible().catch(() => false)) {
  await page.getByLabel('New password (8+ characters)').fill('Testing#12345'); await page.getByLabel('Repeat the new password').fill('Testing#12345')
  await page.getByRole('button', { name: 'Save password' }).click(); await wait(800)
}
if (await page.getByText('I have read these rules').isVisible().catch(() => false)) {
  await page.getByText('I have read these rules').click(); await page.getByRole('button', { name: 'Continue to the portal' }).click(); await wait(800)
}
await page.locator('input[type=file]').setInputFiles(SAMPLE); await wait(1500)
await page.getByRole('button', { name: /^Import \d+ rows/ }).click(); await wait(1500)

// ---------- 1. nothing is built in ----------
await dock('Tasks')
await openMenu('Ahmed Reda', 'HR-01')
let items = await menuItems()
ok(items.some((t) => /No actions yet/.test(t)), '1a. with no actions configured the menu says so', items.join(' | '))
ok(!items.some((t) => /^(Done|Waive|Block|Reopen)/.test(t)), '1b. no built-in Done / Waive / Block / Reopen in the menu', items.join(' | '))
await closeMenu()

// ---------- 2. Workflow is locked until Edit; add own actions; Cancel drops; Save keeps ----------
await dock('Settings'); await page.getByText('Workflow', { exact: true }).first().click(); await wait(600)
ok(await page.getByRole('button', { name: 'Add action' }).isDisabled(), '2a. Add action is locked outside edit mode')
await page.getByRole('button', { name: 'Edit actions' }).click(); await wait(300)
await page.getByRole('button', { name: 'Add action' }).click(); await wait(300)
await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await wait(400)
ok(await page.getByText('No actions yet').count() > 0, '2b. Cancel drops an unsaved action')
await page.getByRole('button', { name: 'Edit actions' }).click(); await wait(300)
for (const [i, name] of [[1, 'Done'], [2, 'Block'], [3, 'Approve']]) {
  await page.getByRole('button', { name: 'Add action' }).click(); await wait(250)
  await page.getByLabel(`Name of action ${i}`).fill(name); await page.getByLabel(`Name of action ${i}`).blur()
}
// Block does not finish the task
await page.locator('li').filter({ has: page.getByLabel('Name of action 2') }).locator('label:has-text("Finishes the task")').click()
await wait(300)
await page.getByRole('button', { name: 'Save changes' }).click(); await wait(600)
let st = await stored()
ok(st.settings?.flow?.length === 3, '2c. three actions saved', JSON.stringify(st.settings?.flow?.map((a) => a.label)))
ok(st.settings?.flow?.find((a) => a.label === 'Block')?.finishes === false, '2d. "Block" is saved as not finishing the task', JSON.stringify(st.settings?.flow?.find((a) => a.label === 'Block')))
ok(st.settings?.flow?.find((a) => a.label === 'Done')?.finishes !== false, '2e. "Done" still finishes the task')

// ---------- 3. a non-finishing action does NOT make the task Done ----------
await dock('Tasks')
await openMenu('Ahmed Reda', 'HR-01')
items = await menuItems()
ok(['Done', 'Block', 'Approve'].every((n) => items.some((t) => t.startsWith(n))), '3a. the menu lists exactly my actions', items.join(' | '))
ok(!items.some((t) => /^Reopen/.test(t)), '3b. Reopen is not offered before anything is recorded', items.join(' | '))
await page.getByRole('menuitem', { name: /^Block/ }).click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Block', exact: true }).click(); await wait(600)
ok(await row('Ahmed Reda', 'HR-01').count() > 0, '3c. after "Block" the task is still open (not Done)')
const lineText = await row('Ahmed Reda', 'HR-01').innerText()
ok(/Block/.test(lineText) && !/Done/.test(lineText.replace(/Done\w/, '')), '3d. its status line shows the action name "Block"', lineText.replace(/\n/g, ' | '))
st = await stored()
const ahmed = st.leavers.find((l) => l.values.name === 'Ahmed Reda')
ok(ahmed?.tasks['HR-01']?.s === 'acted', '3e. stored as an "acted" record, not "done"', JSON.stringify(ahmed?.tasks['HR-01']))
await openMenu('Ahmed Reda', 'HR-01'); items = await menuItems()
ok(items.some((t) => /^Reopen/.test(t)), '3f. Reopen is offered once something is recorded', items.join(' | '))
await page.getByRole('menuitem', { name: /^Done/ }).click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Done', exact: true }).click(); await wait(600)
ok(await row('Ahmed Reda', 'HR-01').count() === 0, '3g. "Done" finishes the task (it leaves the open list)')
st = await stored()
ok((await stored()).leavers.find((l) => l.values.name === 'Ahmed Reda')?.tasks['HR-01']?.s === 'done', '3h. stored as "done"')

// ---------- 4. Reopen ----------
await choose('All open', 'Everything'); await search('Ahmed')
await openMenu('Ahmed Reda', 'HR-01'); items = await menuItems()
ok(items.some((t) => /^Reopen/.test(t)), '4a. a finished task offers Reopen', items.join(' | '))
await page.getByRole('menuitem', { name: /^Reopen/ }).click(); await wait(500)
st = await stored()
ok(!(st.leavers.find((l) => l.values.name === 'Ahmed Reda')?.tasks['HR-01']), '4b. Reopen clears the record')
await choose('Everything', 'All open'); await search('')

// ---------- 5. SLA workflow: ordered actions, progress, completion ----------
await dock('Settings'); await page.getByText('Workflow', { exact: true }).first().click(); await wait(500)
await page.getByRole('tab', { name: 'SLA workflow' }).click(); await wait(500)
await page.getByRole('button', { name: 'Edit SLA workflow' }).click(); await wait(300)
await page.getByRole('button', { name: 'Configure' }).first().click(); await wait(400)          // HR-01
await choose('Choose an action', 'Approve', page.locator('[role=dialog]'))
await choose('Choose an action', 'Done', page.locator('[role=dialog]'))
await page.locator('[role=dialog]').getByRole('checkbox').first().check({ force: true }).catch(() => {})
await page.getByRole('button', { name: 'Done', exact: true }).last().click(); await wait(400)
// HR-03 waits for HR-01 · Approve ; HR-01 also "waits" for HR-05 (a rule most leavers do not have)
await page.getByRole('button', { name: 'Configure' }).nth(2).click(); await wait(400)
await choose('Choose a rule', /x/.test('') ? '' : 'HR-01 · Register termination request / decision', page.locator('[role=dialog]'))
await choose('The whole task is done', 'Approve', page.locator('[role=dialog]'))
await page.getByRole('button', { name: 'Done', exact: true }).last().click(); await wait(400)
// loop prevention: HR-01 may not wait for HR-03
await page.getByRole('button', { name: 'Configure' }).first().click(); await wait(400)
await page.locator('[role=dialog] button:has-text("Choose a rule")').click(); await wait(300)
const opts = await page.getByRole('option').allInnerTexts()
ok(!opts.some((t) => t.startsWith('HR-03')), '5a. HR-03 (which waits for HR-01) is not offered to HR-01, so they cannot block each other', opts.slice(0, 4).join(' | '))
ok(opts.some((t) => t.startsWith('HR-05')), '5b. other rules are offered')
await page.getByRole('option').filter({ hasText: /^HR-05/ }).click(); await wait(300)   // HR-01 waits for HR-05 (not applicable to most leavers)
await page.getByRole('button', { name: 'Done', exact: true }).last().click(); await wait(400)
await page.getByRole('button', { name: 'Save changes' }).click(); await wait(600)

// ---------- 5y. each leaver keeps the rules they were created with ----------
await dock('Tasks'); await search('Khaled')
await openMenu('Khaled Mansour', 'HR-01'); items = await menuItems()
ok(!items.some((t) => /after Approve/.test(t)) && !items.some((t) => /Waiting for HR-05/.test(t)), '5y1. a leaver created earlier does NOT pick up the new rule actions or waits', items.join(' | '))
await closeMenu()
await dock('Settings'); await page.getByText('Deadlines').first().click(); await wait(600)
await page.getByRole('button', { name: 'Apply to existing leavers' }).click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Confirm' }).click(); await wait(700)
await dock('Tasks'); await search('Khaled')
await openMenu('Khaled Mansour', 'HR-01'); items = await menuItems()
ok(items.some((t) => /Waiting for HR-05/.test(t)), '5y2. "Apply to existing leavers" gives them the current rules', items.join(' | '))
await closeMenu()

await dock('Tasks')
await search('Khaled')
await openMenu('Khaled Mansour', 'HR-01'); items = await menuItems()
ok(items.some((t) => /Waiting for HR-05/.test(t)), '5c. every leaver has HR-05, so HR-01 waits for it', items.join(' | '))
await closeMenu()
// switch HR-05 off for this one leaver: HR-01 is no longer held up by it for him, but still is for others
await dock('Leavers'); await page.getByText('Khaled Mansour', { exact: true }).first().click(); await wait(800)
const rowsBefore = await page.locator('table[aria-label="Tasks for this leaver"] tbody tr').count()
await page.getByRole('button', { name: 'SLA rules for this leaver' }).click(); await wait(500)
await page.locator('[role=dialog] li', { hasText: 'HR-05' }).first().locator('label').click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Done', exact: true }).last().click(); await wait(500)
const rowsAfter = await page.locator('table[aria-label="Tasks for this leaver"] tbody tr').count()
ok(rowsBefore === 24, '5c1. a leaver has all 24 rules', String(rowsBefore))
ok(rowsAfter === rowsBefore - 1, '5c2. switching one rule off for a leaver removes only that rule from his page', `${rowsBefore} -> ${rowsAfter}`)
await dock('Leavers'); await page.getByText('Tarek Salem', { exact: true }).first().click(); await wait(800)
ok(await page.locator('table[aria-label="Tasks for this leaver"] tbody tr').count() === 24, '5c3. another leaver still has all 24 rules')
await dock('Tasks'); await search('Khaled')
await openMenu('Khaled Mansour', 'HR-01'); items = await menuItems()
ok(!items.some((t) => /Waiting for HR-05/.test(t)), '5c4. HR-01 is no longer held up by HR-05 for the leaver who has it switched off', items.join(' | '))
await closeMenu(); await search('Tarek')
await openMenu('Tarek Salem', 'HR-01'); items = await menuItems()
ok(items.some((t) => /Waiting for HR-05/.test(t)), '5c5. it still waits for HR-05 for a leaver who has it on', items.join(' | '))
await closeMenu(); await search('Khaled')
await openMenu('Khaled Mansour', 'HR-01'); items = await menuItems()
ok(items.some((t) => /^Approve/.test(t)) && items.some((t) => /Done/.test(t)), '5d. HR-01 lists its own actions', items.join(' | '))
const doneItem = page.getByRole('menuitem', { name: /^Done/ }).first()
ok(await doneItem.getAttribute('aria-disabled') === 'true', '5e. the second action is locked until the first is done', await doneItem.innerText())
await page.getByRole('menuitem', { name: /^Approve/ }).click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Save', exact: true }).click(); await wait(600)
const t1 = await row('Khaled Mansour', 'HR-01').innerText()
ok(/1 of 2 actions/.test(t1) && /left: Done/.test(t1), '5f. progress reads "1 of 2 actions · left: Done"', t1.replace(/\n/g, ' | '))
const t3 = await row('Khaled Mansour', 'HR-03').innerText()
ok(!/Waiting for/.test(t3), '5g. HR-03 is released once HR-01 · Approve is done for that employee', t3.replace(/\n/g, ' | '))
const t3b = await row('Tarek Salem', 'HR-03').innerText().catch(() => '')
await search('Tarek')
const t3c = await row('Tarek Salem', 'HR-03').innerText()
ok(/Waiting for HR-01 · Approve/.test(t3c), '5h. HR-03 still waits for another employee whose HR-01 · Approve is not done', t3c.replace(/\n/g, ' | '))
await search('Khaled')
await openMenu('Khaled Mansour', 'HR-01')
await page.getByRole('menuitem', { name: /^Done/ }).first().click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Save', exact: true }).click(); await wait(600)
ok(await row('Khaled Mansour', 'HR-01').count() === 0, '5i. the last action finishes the task')

// ---------- 5z. switching a rule off for everyone ----------
await dock('Settings'); await page.getByText('Deadlines').first().click(); await wait(600)
await page.getByRole('button', { name: 'Edit deadlines' }).click(); await wait(300)
await page.locator('tr', { hasText: 'HR-02' }).first().locator('label').click(); await wait(300)
await page.getByRole('button', { name: 'Save changes' }).click(); await wait(600)
await dock('Leavers'); await page.getByText('Tarek Salem', { exact: true }).first().click(); await wait(800)
ok(await page.locator('table[aria-label="Tasks for this leaver"] tbody tr').count() === 24, '5z1. a rule switched off later stays on for a leaver created before it was switched off')
// a leaver created after that gets the rules that are on now
await dock('Settings'); await page.getByText('Import leavers').first().click(); await wait(600)
await page.locator('input[type=file]').setInputFiles(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'new-leaver.csv')); await wait(1200)
await page.getByRole('button', { name: /^Import \d+ rows/ }).click(); await wait(1500)
await dock('Leavers'); await page.getByText('Nour Hassan', { exact: true }).first().click(); await wait(800)
ok(await page.locator('table[aria-label="Tasks for this leaver"] tbody tr').count() === 23, '5z2. a leaver created afterwards does not get the rule that was switched off')
const tasksTable = await page.locator('table[aria-label="Tasks for this leaver"]').innerText()
ok(!/HR-02/.test(tasksTable), '5z3. the new leaver has no HR-02')
await page.getByRole('button', { name: 'SLA rules for this leaver' }).click(); await wait(500)
ok((await page.locator('[role=dialog] li', { hasText: 'HR-02' }).first().innerText()).includes('off when this leaver was created'), '5z4. the leaver\'s own list says HR-02 was off when they were created')
await page.locator('[role=dialog]').getByRole('button', { name: 'Done', exact: true }).last().click(); await wait(300)

// a rule switched off stays in the reports
await dock('Reports'); await wait(800)
const stepPerf = await page.locator('table[aria-label="Step performance"]').innerText()
ok(/HR-02/.test(stepPerf) && /switched off/.test(stepPerf), '5z5. a rule switched off still appears in Reports (marked "switched off")', stepPerf.slice(0, 160).replace(/\n/g, ' | '))

// ---------- 6. saved data: keys the shared database accepts ----------
st = await stored()
const keys = st.leavers.flatMap((l) => Object.keys(l.tasks))
ok(keys.length > 0 && keys.every((k) => /^[\w-]{1,80}$/.test(k)), '6a. every saved task key is valid for the shared database', keys.filter((k) => !/^[\w-]{1,80}$/.test(k)).join(', '))
ok(keys.some((k) => k.includes('__')), '6b. action progress is stored (STEP__ACTION)')
const khaled = st.leavers.find((l) => l.values.name === 'Khaled Mansour')
ok(khaled?.tasks['HR-01']?.s === 'done', '6c. the finished task is stored as done', JSON.stringify(khaled?.tasks['HR-01']))

// ---------- 7. edit mode survives a reload; nothing saved by mistake ----------
await page.reload(); await wait(2000)
await dock('Settings'); await page.getByText('Workflow', { exact: true }).first().click(); await wait(500)
ok(await page.getByLabel('Name of action 1').inputValue() === 'Done', '7a. saved actions are still there after a reload')

// ---------- 8. old saved actions (Waive / Block / Reopen with types) are brought up to date ----------
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('offboarding.codebase.v2'))
  const base = { description: '', date: 'off', member: 'off', comment: 'off' }
  s.settings.flow = [
    { id: 'done', kind: 'done', label: 'Done', ...base, date: 'required' }, { id: 'waive', kind: 'waive', label: 'Waive', ...base },
    { id: 'block', kind: 'block', label: 'Block', ...base }, { id: 'reopen', kind: 'reopen', label: 'Reopen', ...base },
  ]
  localStorage.setItem('offboarding.codebase.v2', JSON.stringify(s))
})
await page.reload(); await wait(2000)
st = await stored()
const flow = (await page.evaluate(() => JSON.parse(localStorage.getItem('offboarding.codebase.v2')).settings.flow))
// the migration runs in memory on load; look at what the menu offers
await dock('Tasks'); await search('Salma')
await openMenu('Salma Ibrahim', 'HR-04'); items = await menuItems()
ok(items.some((t) => /^Block/.test(t)) && items.some((t) => /^Waive/.test(t)), '8a. an old Block / Waive action is still offered', items.join(' | '))
ok(!items.some((t) => /^Reopen/.test(t)), '8b. the old Reopen entry is gone (nothing recorded yet)', items.join(' | '))
await page.getByRole('menuitem', { name: /^Block/ }).click(); await wait(500)
st = await stored()
ok(st.leavers.find((l) => l.values.name === 'Salma Ibrahim')?.tasks['HR-04']?.s === 'acted', '8c. an old "Block" action no longer turns the task into Done', JSON.stringify(st.leavers.find((l) => l.values.name === 'Salma Ibrahim')?.tasks['HR-04']))

// ---------- 10. every box has its own Edit ----------
await dock('Settings'); await page.getByText('Calendar and alerts').first().click(); await wait(600)
const dueSoon = page.getByLabel('Due Soon window (days)')
ok(await dueSoon.isDisabled() && await page.getByRole('button', { name: 'Edit holidays' }).isEnabled(), '10a. each box on Calendar and alerts has its own Edit, locked until pressed')
await page.getByRole('button', { name: 'Edit calendar and alerts' }).click(); await wait(300)
ok(await dueSoon.isEnabled(), '10b. pressing Edit on a box unlocks that box')
ok(await page.getByLabel('Min' + 'imum months').count() === 0 && await page.getByLabel('Service threshold (years)').isDisabled(), '10c. the other boxes stay locked while one is edited')
ok(await page.getByRole('button', { name: 'Edit holidays' }).isDisabled(), '10d. their Edit buttons wait until this one is saved or cancelled')
await dueSoon.fill('3'); await page.getByRole('button', { name: 'Save changes' }).click(); await wait(500)
ok((await stored()).settings.dueSoon === 3, '10e. Save changes stores only after pressing it')
await page.getByRole('button', { name: 'Edit calendar and alerts' }).click(); await dueSoon.fill('9')
await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await wait(300)
ok((await stored()).settings.dueSoon === 3 && await dueSoon.inputValue() === '3', '10f. Cancel puts the box back as it was')
ok(await page.getByText('Block adding leavers and imports after the closing time').count() > 0 || await page.getByText('The shared sheet needs the database').count() > 0, '10g. the end-of-day box has its own option for blocking adds')

// ---------- 11. archive: Owner only, hidden until the Owner allows a person ----------
const signIn = async (email, pw, newPw = 'Testing#12345') => {
  await page.goto(BASE + '/#/dashboard'); await page.reload(); await wait(1200)
  await page.getByLabel('Email or username').fill(email)
  await page.locator('input[type=password]').fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click(); await wait(2200)
  if (await page.getByText('Choose your own password').isVisible().catch(() => false)) {
    await page.getByLabel('New password (8+ characters)').fill(newPw); await page.getByLabel('Repeat the new password').fill(newPw)
    await page.getByRole('button', { name: 'Save password' }).click(); await wait(1000)
  }
  if (await page.getByText('I have read these rules').isVisible().catch(() => false)) {
    await page.getByText('I have read these rules').click(); await page.getByRole('button', { name: 'Continue to the portal' }).click(); await wait(800)
  }
}
const signOut = async () => { await page.getByRole('button', { name: 'Open my profile' }).click(); await wait(600); await page.getByRole('button', { name: 'Sign out' }).click(); await wait(800) }
await dock('Leavers'); await page.getByText('Tarek Salem', { exact: true }).first().click(); await wait(800)
const tarekId = await page.evaluate(() => JSON.parse(localStorage.getItem('offboarding.codebase.v2')).leavers.find((l) => l.values.name === 'Tarek Salem').id)
ok(await page.getByRole('button', { name: 'Archive', exact: true }).count() === 1 && await page.getByRole('button', { name: 'Delete', exact: true }).count() === 0, '11a. the Owner sees Archive (there is no Delete any more)')
await page.getByRole('button', { name: 'Archive', exact: true }).click(); await wait(400)
await page.locator('[role=dialog]').getByRole('button', { name: 'Confirm' }).click(); await wait(800)
await dock('Leavers')
ok(await page.getByText('Tarek Salem', { exact: true }).count() === 0, '11b. an archived leaver leaves the list')
ok(await page.getByRole('button', { name: /^Archived \(1\)/ }).count() === 1, '11c. the Owner sees an Archived (1) button')
await dock('Tasks'); await search('Tarek')
ok(await page.locator('tr', { hasText: 'Tarek Salem' }).count() === 0, '11d. an archived leaver has no tasks on the Tasks page')
// a second person, an Admin, without permission
await dock('Settings'); await page.getByText('People and access').first().click(); await wait(800)
await page.getByRole('button', { name: 'Add profile' }).click(); await wait(400)
await page.getByLabel('Full name').fill('Sam Viewer'); await page.getByLabel('Email (used to sign in)').fill('sam@test.com')
const defPw = await page.getByLabel('Password to send them').inputValue()
await page.getByRole('button', { name: 'Save profile' }).click(); await wait(700)
await signOut(); await signIn('sam@test.com', defPw)
await dock('Leavers')
ok(await page.getByRole('button', { name: /^Archived/ }).count() === 0, '11e. without permission nobody sees the Archived button, even an Admin')
await page.goto(BASE + '/#/leavers/' + tarekId); await wait(1200)
ok(await page.getByText('Leaver not found').count() > 0, '11f. an archived leaver cannot be opened by address either')
await signOut(); await signIn('admin@offboard.local', 'Admin#123')
await dock('Settings'); await page.getByText('People and access').first().click(); await wait(800)
await page.locator('tr', { hasText: 'Sam Viewer' }).getByRole('button', { name: 'Edit', exact: true }).click(); await wait(400)
await page.getByText('Can see archived leavers').click(); await page.getByRole('button', { name: 'Save profile' }).click(); await wait(700)
await signOut(); await signIn('sam@test.com', 'Testing#12345')
await dock('Leavers')
ok(await page.getByRole('button', { name: /^Archived \(1\)/ }).count() === 1, '11g. once the Owner allows it, that person sees Archived (1)')
await page.getByRole('button', { name: /^Archived \(1\)/ }).click(); await wait(500)
ok(await page.getByText('Tarek Salem', { exact: true }).count() === 1, '11h. and can see the archived leaver')
await page.getByText('Tarek Salem', { exact: true }).first().click(); await wait(800)
ok(await page.getByRole('button', { name: 'Restore', exact: true }).count() === 0, '11i. only the Owner can restore')
await signOut(); await signIn('admin@offboard.local', 'Admin#123')
await page.goto(BASE + '/#/leavers/' + tarekId); await wait(1000)
await page.getByRole('button', { name: 'Restore', exact: true }).click(); await wait(600)
await dock('Leavers')
ok(await page.getByText('Tarek Salem', { exact: true }).count() === 1, '11j. Restore puts the leaver back in the list')

ok(errors.length === 0, '9. no errors in the browser console', errors.slice(0, 3).join(' | '))
await browser.close()
const failed = results.filter((r) => !r.cond)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
