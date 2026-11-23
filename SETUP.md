# Canal Sugar Offboarding: setup and maintenance

For whoever looks after the project. **This file is not included in the Windows zip.**
End users only get the zip and its `Setup guide (with pictures).html`.

## 1. Run it on your own machine

Needs Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:5173, reloads as you edit
npm run build        # production build into dist/
npm run preview      # serve dist/ locally
```

There is no sign-up page. **With the database set up** (`VITE_DB_URL` in `.env`) accounts, roles and the default password live in MongoDB behind the gateway, so anyone the Owner adds can sign in from any computer; the Owner account is created from the gateway's `OWNER_EMAIL` / `OWNER_NAME` / `DEFAULT_PASSWORD` (default `owner@canalsugar.com` / `abd@123456`) and must change the password at first sign-in. **Without the database** each browser keeps its own accounts and the Owner comes from `VITE_OWNER_EMAIL` / `VITE_OWNER_NAME`. (The recording build, `npm run guide:record`, uses `VITE_SEED_DEMO=1`.)

## 2. Give it to Windows users (the zip)

```bash
npm run package:windows
```

Result: `release/Canal-Sugar-Offboarding-Windows.zip` (about 48 MB).

Needs `zip`, `python3` with Pillow (makes the icon), and internet the first time (downloads the Windows
Node runtime into `scripts/.cache/`).

What the zip contains:

| Item | Purpose |
|---|---|
| `Install Canal Sugar Offboarding.bat` | The one file users run (tell them: right-click, **Run as administrator**; it also asks for permission by itself if double-clicked). Copies the folder to `C:\Users\<name>\program\Canal-Sugar-Offboarding`, makes a desktop icon, starts the portal. |
| `Setup guide (with pictures).html` | Visual steps for non-technical users. Source: `public/setup-guide.html`. |
| `README.txt` | Plain-text steps. Source: `scripts/README-windows.txt`. |
| `More/` | `Open with a window (for problems).bat`, `Stop Canal Sugar Offboarding.bat`. |
| `files/` | `runtime/node.exe`, `server/server.cjs`, `www/` (the built app), `icon.ico`, `launch.ps1`, `make-shortcut.ps1`. Users never open this. |

How it runs: `server.cjs` serves the app on `http://localhost:47321` (this computer only) and opens the default
browser. It exits by itself about 3 minutes after the last tab closes. The port is fixed on purpose: saved data
belongs to that address.

### Hand it out

1. Upload the zip to Google Drive and share it as **Anyone with the link can view**.
2. Put the link in `DEFAULT_LINKS.windows` in `src/guide/links.ts` (it is set already), or change it in the app:
   **Guide, Edit video links**.
3. Rebuild and re-upload whenever the app changes. Users run **Install Canal Sugar Offboarding** again; the folder is replaced and their
   data is kept (it is in their browser, not the folder).

## 3. Guide videos

Ten screen recordings, made by Playwright so they can be redone any time.

```bash
npm run guide:record                         # all topics (needs Google Chrome and ffmpeg)
npm run guide:record -- dashboard tasks      # only these
```

They are written to `public/guide-videos/<topic>.mp4` and play inside the portal (Guide page). Edit the captions
in `e2e/record/topics.mjs`; keep the written steps in `src/guide/topics.ts` in step with them. More in
`e2e/record/README.md`.

> The `dashboard`, `leaver-tasks` and `tasks` videos were recorded before the Done dialog and **Take action**
> button. Re-record those three when the screens settle.

## 4. Where things are

```
src/lib/        engine (SLA maths), defaults, store, auth, rbac, audit, atlas, theme, importer
src/views/      Dashboard, Leavers, LeaverDetail, Tasks, Reports, Settings, Guide, Login
src/views/settings/   Users, Access, Sources (file import), DatabaseCopy, Activity
src/ui/         Dock, TaskMenu, kit (shared controls), ProfileDialog
src/guide/      guide text (topics.ts) and video links (links.ts)
public/         logos, guide videos, setup-guide.html
scripts/        Windows packaging and server
e2e/record/     video recording scripts
```

## 5. Everyday changes (no code)

In the app, as Admin, under **Settings**:

- **Reasons and teams**: termination reasons and the teams that own steps.
- **Fields**: extra information kept about each leaver.
- **SLA rules**: who does each step, when the clock starts, how many days.
- **People and access**: logins, roles and permissions (Owner only).
- **Import leavers**: upload a CSV, Excel or JSON file from the computer. The same upload screen appears right after the first sign-in.
- **Data**: back up and restore everything as JSON.

## 6. Things to know

- **Data lives in the browser** (`localStorage`). Each computer, and each browser on it, has its own copy. The
  Windows app (`localhost:47321`) and `npm run dev` (`localhost:5173`) do not share data. Move data with
  the Reports exports, or the shared database copy (Settings, Database).
- **Sign-in is not real security.** Profiles and password hashes sit in the same browser storage, so anyone with
  developer tools can get around them. For shared use, move storage and sign-in to a server
  (`src/lib/store.ts` and `src/lib/auth.ts` are the only files that touch storage).

- **Windows launchers** (the install `.bat`, the two `.ps1` helpers, the other `.bat` files) have not been run on a real Windows machine; the
  server and app were tested on Linux. Windows may show "Windows protected your PC" once because nothing is
  code-signed.
- The old test files from the first version were not ported.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `npm run package:windows` fails on the icon | `pip install pillow` |
| Zip step fails | install `zip` (`sudo apt install zip`) |
| Installer copied to the wrong user's folder | It uses the folder of the person who started it. If an administrator's name is typed at the permission prompt, the original user's folder is still used (via `C:\Users\Public\offboard-home.txt`, deleted right after). |
| Port 47321 busy on a user's PC | Another program uses it. Close it, or set `OFFBOARD_PORT` and use the same port every time. |
| User says data vanished | They opened the portal in a different browser, or cleared site data. Restore from a backup. |
| Videos will not play from Drive in the portal | Sharing must be "Anyone with the link"; paste the file's `/view` link. |

## Access control and database (maintainer notes)
- **Roles**: Admin always exists and can do everything. The first account is the **Owner**, who alone manages people, roles and permissions, the database link, and clearing the activity log. The Owner makes roles (Settings, People and access) and sets, per section (including the Activity log), whether a role may view, edit, or take action, and for which teams. Stored in the browser: a UI gate, not server security.
- All of it is stored in the browser, so it is a UI gate, not real security.
- MongoDB Atlas sync needs the gateway in `gateway` (not part of the Windows zip). See its README; `docker-compose.yml` gives a local Mongo for testing.
- **Activity log** (Settings, Activity log): every task action, leaver change, sign-in and access change is recorded with agent, employee and description. It is kept in the browser and pushed to MongoDB when the database is set up. Clearing needs the Owner's password and deletes from MongoDB too.

## Database from .env
Copy `.env.example` to `.env` (project root) and set `VITE_DB_URL` / `VITE_DB_KEY` to the gateway in `gateway` (see its README), then rebuild or run `npm run package:windows`. The MongoDB password lives only in the gateway's own `.env`. There is nothing to type in the app. The cloud-drive sign-ins (OneDrive, Google Drive) were removed.
