# AGENTS.md — طقس سوريا (Syria Weather)

## What this app is
A single-file, client-side weather web app (`index.html`, ~106 KB) with its own inline CSS + JS.
There is **no backend, no build step, and no package manager**. The only other tracked files are
`manifest.json`, `sw.js`, two PNG icons, and `phase2.1.js`.

## Setup already done by Base44
- `docker-compose.base44.yml` serves the repo root **read-only** through `nginx:alpine` on host port 3000
  (`.base44/nginx.conf` disables caching). Because the source is bind-mounted and nginx serves the files
  directly, there is no image rebuild: an edit is visible after a page reload.
- Start: `docker compose -f docker-compose.base44.yml up -d --build`
- Logs: `docker compose -f docker-compose.base44.yml logs -f web`
- Health: `docker compose -f docker-compose.base44.yml ps` (compose healthcheck greps `id="splash"` out of `/`).

## Gotchas
- **The repo root is mode 700 root:root**, so nginx's default worker user cannot traverse the
  bind mount (`stat() failed (13: Permission denied)` → 404/403 on every file). `.base44/nginx.conf`
  therefore sets `user root;`, which only works because the whole file is mounted over
  `/etc/nginx/nginx.conf` (main context). Do not move that file back to `conf.d/`.
- **No live-reload dev server exists for this project.** After any edit, reload the preview page (or call
  `reload_preview`) — nginx will not auto-refresh the browser.
- **`phase2.1.js` is dead code.** `index.html` does not reference it (no `<script src="./phase2.1.js">`).
  Do not assume changes there affect the running app.
- **`sw.js` is not registered.** The service worker registration block at the end of `index.html` instead
  *unregisters* all service workers and clears the Cache API on load. So there is no stale-cache risk,
  and `sw.js` is currently inert.
- **All data comes from third-party keyless APIs** — no API keys or secrets are required:
  `api.open-meteo.com` + `geocoding-api.open-meteo.com` (weather/geocoding, with optional `&models=`),
  `nominatim.openstreetmap.org` (reverse geocoding), MapLibre GL JS 5.7.0 + OpenFreeMap tiles (map),
  `fonts.googleapis.com` (Cairo font). Network failures surface as the in-app Arabic error card.
- The UI language is Arabic and the document is `dir="rtl"`; keep that when editing markup or copy.
- **MapLibre `maxBounds` must not span exactly 360° of longitude.** With `[[-180,-85],[180,85]]`
  MapLibre 5.7 builds a non-invertible projection matrix, `new maplibregl.Map(...)` throws
  `TypeError: Cannot read properties of null (reading '0')`, and the map tab shows the Arabic
  "تعذّر تشغيل الخريطة" error card. Latitude range is irrelevant; inset longitude to ±179.9 (the fix
  applied here). The map is created lazily on the first click of the الخريطة tab, so this only shows up
  after switching tabs.

## How to verify
- `curl -s http://localhost:3000/ | head` returns the HTML document.
- In the browser: the splash screen fades after ~1.1 s and a weather card for Damascus renders.
