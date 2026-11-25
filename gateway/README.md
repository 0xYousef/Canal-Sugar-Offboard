# Database gateway (MongoDB Atlas)

Stores the portal's data and its activity log in MongoDB without putting the database password in the browser.

1. In this folder: copy `.env.example` to `.env` and fill in `MONGODB_URI`, `API_KEY` (any long secret) and `ALLOWED_ORIGIN`.
2. `npm install` then `npm start`.
3. In the project root: copy `.env.example` to `.env`, set `VITE_DB_URL` to this gateway's address and `VITE_DB_KEY` to the same `API_KEY`, then rebuild (`npm run build`).

`VITE_` values are built into the web app, so anyone who can open the portal can find the key. It protects the gateway from strangers,
not from people who already use the portal. Keep the MongoDB password only in the gateway's `.env`.

Endpoints: `GET/PUT /state` (full backup), `POST/GET/DELETE /logs` (activity log, kept in `<collection>_log`; DELETE is only called after the Owner types their password).

## Try it without Atlas (Docker)

    docker compose up -d
    # in .env: MONGODB_URI=mongodb://127.0.0.1:27019

## Shared accounts and sign-in

When the portal is built with `VITE_DB_URL`, sign-in is checked here instead of in each browser, so a person added by the Owner can sign in
from any computer. The gateway keeps people in `<collection>_users`, roles and the default password in `<collection>_config`,
stores passwords with scrypt, signs sessions with an HMAC token, and locks a name for 30 seconds after 5 wrong passwords.
The Owner is created from `OWNER_EMAIL` / `OWNER_NAME` / `DEFAULT_PASSWORD` the first time anyone calls the gateway.

Endpoints: `POST /auth/login`, `GET /auth/me`, `POST /auth/password`, `POST /auth/profile`, `GET/PUT /config`,
`GET/POST /users`, `PUT/DELETE /users/:id`, `POST /users/transfer`, `POST /roles/rename`.

If the gateway is down nobody can sign in.

## Live shared sheet

Everyone signed in works on one sheet, kept in `<collection>_live`. The website sends only what changed and asks for news every few seconds.
Endpoints: `GET/POST /live`, `POST /live/settings` (closing time, Owner or Admin), `POST /live/purge` (remove the sheet now, Owner or Admin).
At the closing time the gateway deletes all leavers once a day. It uses this machine's clock, so set the host's time zone (`TZ=Africa/Cairo`).

## Deploy (Render, Railway, Fly.io, any VPS)

It needs a Node process that keeps running (it holds the database connection and the daily timer), so it cannot go on Vercel.
Use the included `Dockerfile`, or run `npm start`. Set these environment variables on the host:
`MONGODB_URI`, `API_KEY`, `ALLOWED_ORIGIN` (your website address, for example `https://canal-sugar-offboarding.vercel.app`),
`OWNER_EMAIL`, `OWNER_NAME`, `DEFAULT_PASSWORD`, `TZ`, and optionally `SESSION_SECRET`.
In Atlas, allow the host under Network Access.

### On Render
The project root has a `render.yaml`. In Render choose New, Blueprint, pick the repository, and fill in the four values it asks for
(`MONGODB_URI`, `ALLOWED_ORIGIN`, `OWNER_EMAIL`, `DEFAULT_PASSWORD`). Render makes `API_KEY` and `SESSION_SECRET` for you: open the
service's Environment tab, copy `API_KEY` into Vercel as `VITE_DB_KEY`, and set `VITE_DB_URL` to the service address.
Use a paid instance: the free one sleeps when idle, so the daily removal would not run. `/healthz` is the health check (it needs no key and returns no data).

## Live reports for Excel
Set `REPORT_KEY` (a long random secret) to switch on `GET /report/data?table=cases|tasks|teams|summary&format=csv|json|html&key=...`. See `samples/live-reports/README.md`. After changing `src/lib` report code, run `npm run build:gateway` and commit `gateway/report-data.mjs`.
