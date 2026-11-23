// Shared helpers for the guide recordings: a visible cursor, on-screen captions, human-paced actions.
export const SIZE = { width: 1280, height: 720 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const OVERLAY = () => {
  const css = document.createElement('style')
  css.textContent = `
    #rec-cap{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:2147483646;max-width:80vw;
      background:rgba(15,20,18,.88);color:#fff;font:600 18px/1.35 system-ui,sans-serif;padding:10px 20px;border-radius:999px;
      box-shadow:0 8px 30px rgba(0,0,0,.3);opacity:0;transition:opacity .25s;pointer-events:none;text-align:center}
    #rec-cur{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;z-index:2147483647;
      background:rgba(255,196,0,.55);border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.35);pointer-events:none;transition:transform .12s}
    #rec-cur.down{transform:scale(.6);background:rgba(255,80,60,.7)}
    .rec-ring{position:fixed;z-index:2147483646;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #ff6a3c;pointer-events:none;animation:rr .55s ease-out forwards}
    @keyframes rr{to{transform:scale(4.5);opacity:0}}`
  const add = () => {
    document.head.appendChild(css)
    const cap = Object.assign(document.createElement('div'), { id: 'rec-cap' })
    const cur = Object.assign(document.createElement('div'), { id: 'rec-cur' })
    document.body.append(cap, cur)
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px' }, true)
    addEventListener('mousedown', (e) => {
      cur.classList.add('down')
      const r = Object.assign(document.createElement('div'), { className: 'rec-ring' })
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.append(r); setTimeout(() => r.remove(), 600)
    }, true)
    addEventListener('mouseup', () => cur.classList.remove('down'), true)
    window.__cap = (t) => { cap.textContent = t || ''; cap.style.opacity = t ? '1' : '0' }
  }
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', add) : add()
}

export async function newSession(browser, { storageState } = {}) {
  const context = await browser.newContext({
    viewport: SIZE, recordVideo: { dir: 'guide-videos/.raw', size: SIZE }, storageState, deviceScaleFactor: 1,
  })
  await context.addInitScript(OVERLAY)
  const page = await context.newPage()
  return { context, page }
}

export function actor(page, baseUrl) {
  let x = 640, y = 360
  const h = {
    sleep,
    async goto() { await page.goto(baseUrl); await page.waitForLoadState('networkidle'); await sleep(600) },
    /** Show a caption and hold it long enough to read. */
    async say(text, extra = 0) {
      await page.evaluate((t) => window.__cap && window.__cap(t), text)
      await sleep(900 + text.length * 38 + extra)
    },
    async hush() { await page.evaluate(() => window.__cap && window.__cap('')) },
    async move(loc) {
      const el = typeof loc === 'string' ? page.locator(loc).first() : loc
      await el.scrollIntoViewIfNeeded()
      const b = await el.boundingBox()
      if (!b) throw new Error('not visible: ' + String(loc))
      const tx = b.x + b.width / 2, ty = b.y + b.height / 2
      await page.mouse.move(tx, ty, { steps: 28 }); x = tx; y = ty
      await sleep(260)
    },
    async click(loc) { await h.move(loc); await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(650) },
    async type(loc, text) { await h.click(loc); await page.keyboard.type(text, { delay: 70 }); await sleep(350) },
    async pickOption(trigger, optionName) {
      await h.click(trigger)
      await h.click(page.getByRole('option', { name: optionName, exact: true }))
    },
    async nav(label) { await h.click(page.locator(`nav[aria-label="Sections"] button[aria-label="${label}"]`)); await sleep(900) },
    async scroll(dy, ms = 900) {
      const steps = 18
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(ms / steps) }
      await sleep(350)
    },
    async scrollTop() { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(700) },
  }
  return h
}
