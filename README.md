# Canal Sugar Offboarding

Track leavers, their SLA tasks and reports. Everyone signed in works on one live shared sheet, and the sheet is removed from the server at a closing time you set.

| Folder | What it is |
|---|---|
| `src/` | The website (React, TypeScript, Vite, HeroUI, Tailwind) |
| `gateway/` | Small Node server between the website and MongoDB Atlas: sign-in, roles, the live sheet, the activity log |
| `public/` | Logo, icons, guide videos |
| `e2e/record/` | Script that records the guide videos |
| `scripts/` | Windows installer helpers (optional) |
| `samples/` | `sample-leavers.xlsx` for testing an import |

## Run locally
```bash
npm install
cp .env.example .env            # set VITE_DB_URL and VITE_DB_KEY
cd gateway && npm install && cp .env.example .env   # set MONGODB_URI, API_KEY, OWNER_EMAIL ...
npm start                       # gateway on :8787
cd .. && npm run dev            # website on :5173
```

## Deploy
1. **Gateway first**, on a host that keeps a Node process running (Render, Railway, Fly.io or a VPS). It cannot run on Vercel: it keeps a database connection and runs the daily removal timer. See `gateway/README.md`. Set `ALLOWED_ORIGIN` to your Vercel address.
2. **Website on Vercel.** Import the project, keep the Vite defaults, and add `VITE_DB_URL` (the gateway's https address) and `VITE_DB_KEY` as environment variables. `vercel.json` already handles page refreshes and caching.
3. In Atlas, allow the gateway host under Network Access.

Scripts: `npm run dev`, `npm run build`, `npm run lint`.
