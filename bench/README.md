# Performance survey: Google Sheet setup

The app's **Performance survey** (menu › Performance survey) benchmarks every scene, preset and rendering method.
When the user presses **Send results**, it posts the results as JSON to a Google Apps Script web app,
which appends them to a Google Sheet you own.

1. Create a new Google Sheet (for example "Prism performance survey").
2. In the sheet: **Extensions › Apps Script**. Delete the starter code and paste all of `apps-script.gs`. Save.
3. **Deploy › New deployment**. Type: **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and allow access.
4. Copy the **Web app URL** (it ends in `/exec`) into `project.json`:
   `"benchmarkUrl": "https://script.google.com/macros/s/…/exec"`
5. Rebuild (`node tools/build.mjs`) and push. Open the URL in a browser to check it: it answers `{"ok":true,…}`.

After you change the script, use **Deploy › Manage deployments › Edit › New version** so the URL stays the same.

## What gets sent

Only after the user presses Send, and they can read the exact JSON first:

- A random run ID, the app version and build, web or desktop.
- Per test: scene, view, preset, method, resolution, frame times (median, 90th and 99th percentile), wall-clock fps, shader build time.
- WebGL GPU vendor and renderer, WebGL limits, CPU thread count, approximate memory, screen size, browser user agent and client hints.
- Desktop app only: CPU model, RAM, Windows version, GPU name, driver version and date, firmware (BIOS) vendor, version and date, motherboard and system model.

No names, accounts, IP addresses or locations are collected (Apps Script does not see the sender's IP).

## Sheets

- **Runs**: one row per survey with the device summary, the score and the full JSON.
- **Results**: one row per test, good for filters and pivot tables (for example median fps by GPU and preset).
