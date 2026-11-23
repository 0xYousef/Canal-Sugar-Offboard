// Canal Sugar Offboarding: local server. Serves the web app on this computer only (127.0.0.1)
// and opens it in the default browser. It stops by itself a few minutes after the last browser tab closes.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { exec } = require('node:child_process')

const PORT = Number(process.env.OFFBOARD_PORT) || 47321     // fixed: saved data is tied to this address
const URL_ = `http://localhost:${PORT}/`
const ROOT = path.join(__dirname, '..', 'www')
const IDLE_MS = Number(process.env.OFFBOARD_IDLE_MS) || 3 * 60 * 1000
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.map': 'application/json',
}
const PING = '<script>(function(){function p(){fetch("/__ping",{cache:"no-store"}).catch(function(){})}p();setInterval(p,20000)})()</script>'

let lastPing = Date.now(), pinged = false

function openBrowser() {
  if (process.env.OFFBOARD_NO_OPEN) return
  const cmd = process.platform === 'win32' ? `start "" "${URL_}"` : process.platform === 'darwin' ? `open "${URL_}"` : `xdg-open "${URL_}"`
  exec(cmd, () => {})
}

function handle(req, res) {
  const url = new URL(req.url, URL_)
  if (url.pathname === '/__ping') { lastPing = Date.now(); pinged = true; res.writeHead(204).end(); return }
  if (url.pathname === '/__quit' && req.method === 'POST') { res.writeHead(200).end('bye'); setTimeout(() => process.exit(0), 100); return }

  let rel
  try { rel = decodeURIComponent(url.pathname) } catch { res.writeHead(400).end(); return }
  let file = path.normalize(path.join(ROOT, rel))
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return }                  // never leave the app folder
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html')

  if (path.basename(file) === 'index.html') {                                       // the page itself: add the "still open" ping
    const html = fs.readFileSync(file, 'utf8').replace('</body>', PING + '</body>')
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }).end(html)
    return
  }
  const size = fs.statSync(file).size
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')                 // lets videos skip around
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 })
    fs.createReadStream(file, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' })
    fs.createReadStream(file).pipe(res)
  }
}

const server = http.createServer(handle)
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { openBrowser(); setTimeout(() => process.exit(0), 300); return }   // already running: just open it
  console.error('Could not start:', e.message); process.exit(1)
})
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Canal Sugar Offboarding is running at ${URL_}`)
  openBrowser()
  let lastCheck = Date.now()
  setInterval(() => {
    const now = Date.now()
    if (now - lastCheck > 45000) lastPing = now            // the computer was asleep: give the page time to wake up
    lastCheck = now
    if (now - lastPing > (pinged ? IDLE_MS : 10 * 60 * 1000)) { console.log('No browser tab is open any more. Stopping.'); process.exit(0) }
  }, Math.min(15000, Math.max(500, IDLE_MS / 4))).unref()
})
