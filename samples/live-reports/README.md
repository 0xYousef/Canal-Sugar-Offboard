# Live reports in Excel

Excel reads the same numbers the website shows, straight from the gateway, and refreshes them on demand or on a timer.

## One-time setup (the person who runs the gateway)
1. Choose a long random secret and set it as `REPORT_KEY` on the gateway (Vercel: Project, Settings, Environment Variables, then redeploy). Without it the link stays switched off.
2. Make the files with your real address and key (these two placeholders are only an example):
   `node scripts/make-live-excel.mjs https://YOUR-APP.vercel.app/api YOUR_REPORT_KEY samples/live-reports`
3. Share the four `.iqy` files only with people who may see all cases. The key is inside them.

## Using it
- Double-click an `.iqy` file, choose a cell, press OK. Allow the connection when Excel asks.
- Right-click the table, **Refresh**, or open **Data, Queries & Connections, Properties** and tick "Refresh every N minutes" and "Refresh data when opening the file".
- Files: **Summary**, **All cases** (archived included, with an Archived column), **All tasks** (every SLA task), **Team performance**.
- Prefer Power Query? Paste the blocks from `live-reports.pq.txt` (Data, Get Data, Blank Query, Advanced Editor).

## Notes
- It shows what is on the shared sheet on the server. After the daily closing time removes the sheet, the tables are empty until the next sheet is loaded.
- To stop access, change `REPORT_KEY` on the gateway. Old files then stop working.
- Add `&format=json` or `&format=csv` to any link to get the data in those formats.
