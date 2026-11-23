// Records the guide videos. Usage:  npm run guide:record            (all topics)
//                                   npm run guide:record -- dashboard tasks
import { chromium } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { newSession, actor } from './helpers.mjs'
import { topics, NEEDS_LOGIN } from './topics.mjs'

const PORT = 4173, BASE = `http://localhost:${PORT}/`
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(topics)
const unknown = wanted.filter((t) => !topics[t])
if (unknown.length) { console.error('Unknown topic(s):', unknown.join(', '), '\nAvailable:', Object.keys(topics).join(', ')); process.exit(1) }

const OUT = 'public/guide-videos'   // served by the app itself at /guide-videos/<topic>.mp4
rmSync('guide-videos', { recursive: true, force: true }); mkdirSync('guide-videos/.raw', { recursive: true }); mkdirSync(OUT, { recursive: true })
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)) }

const browser = await chromium.launch({ channel: 'chrome' })
try {
  // Sign in once without recording, so each video can start on the dashboard.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const p = await ctx.newPage(); await p.goto(BASE)
  await p.getByRole('textbox', { name: 'Email' }).fill('admin@offboard.local')
  await p.getByLabel('Password', { exact: true }).fill('Admin#123')
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.getByRole('navigation', { name: 'Sections' }).waitFor()
  const state = await ctx.storageState(); await ctx.close()

  for (const id of wanted) {
    process.stdout.write(`recording ${id} … `)
    const { context, page } = await newSession(browser, { storageState: NEEDS_LOGIN[id] === false ? undefined : state })
    const h = actor(page, BASE)
    try {
      await h.goto()
      await h.sleep(700)
      await topics[id](page, h)
      await h.hush(); await h.sleep(900)
    } catch (e) { console.log('FAILED'); console.error(e.message.split('\n')[0]); await page.screenshot({ path: `guide-videos/.raw/${id}-failure.png` }) }
    const video = page.video(); await context.close()
    const raw = await video.path()
    const out = `${OUT}/${id}.mp4`
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart', '-an', out])
    console.log('done →', out)
  }
} finally {
  rmSync('guide-videos', { recursive: true, force: true })
  await browser.close(); server.kill()
}
