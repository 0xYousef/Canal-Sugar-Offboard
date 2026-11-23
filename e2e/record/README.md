# Guide videos

Each topic in the in-app **Guide** page has a video, recorded by a Playwright script so it can be
re-recorded whenever the screens change.

## Record

```bash
npm run guide:record                      # builds the app, then records every topic
npm run guide:record -- dashboard tasks   # only these topics
```

Needs Google Chrome installed (Playwright drives it) and `ffmpeg`.
Output: `public/guide-videos/<topic>.mp4` (1280x720, no audio, with a visible cursor and captions).

Topics (file name = topic id, same ids as `src/guide/topics.ts`):
`sign-in`, `dashboard`, `add-leaver`, `leaver-tasks`, `tasks`, `reports`,
`settings-fields`, `settings-sla`, `settings-people`, `file-sources`.

## Where the videos play from

The videos are served by the app itself (`/guide-videos/<topic>.mp4`), so the Guide page works with no setup.
The page has **Watch here** (plays inside the portal) and **Open video** (new tab) for each topic.

## Optional: host them on Google Drive instead

1. Upload the `.mp4` files to a Drive folder.
2. Share each file (or the folder) as **Anyone with the link can view**.
3. In the app: **Guide → Edit video links**. Paste the folder link and each video's link.
   A pasted link replaces the built-in video for that topic.

Links are saved in the browser. To ship the same links to everyone, put them in `DEFAULT_LINKS`
in `src/guide/links.ts`.

## Change a video

Edit the matching function in `topics.mjs` (captions are the strings passed to `h.say`), then
re-record just that topic. Update the written steps in `src/guide/topics.ts` to match.

The recording build is made with `VITE_SEED_DEMO=1` into `dist-demo/`. That flag adds a demo account (`admin@offboard.local` / `Admin#123`) and three sample leavers, which the production build does not have.
