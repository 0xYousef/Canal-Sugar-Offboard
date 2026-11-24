// Tiny gateway between the Offboarding portal and MongoDB Atlas, for hosts that keep a process running.
// Keeps the connection string on the server. Run: npm install && npm start
import http from 'node:http'
import { handler, getClient } from './app.mjs'
import { makeLive, startPurgeTimer } from './live.mjs'

const { PORT = 8787 } = process.env
let client
try { client = await getClient() } catch (e) { console.error(e.message); process.exit(1) }
// Sheets that existed before this start are found again at the first request; the default one is watched from the start.
makeLive(client.db(process.env.DB_NAME || 'offboarding'), process.env.DB_COLLECTION || 'app_state')
startPurgeTimer()
http.createServer(handler).listen(PORT, () => console.log('Gateway ready on port ' + PORT))
