// Vercel serves the gateway from here, under /api/*. The code is shared with gateway/server.mjs.
import { handler } from '../gateway/app.mjs'

export const config = { maxDuration: 30 }
export default handler
