# Prism

A WebGL2 renderer for phone and desktop browsers. It ray traces small scenes, renders planets and solar systems, and has a
planet engine for Earth-sized worlds that you can fly down to and walk on: terrain made as you go, climate, forests, grass,
rocks, volumetric clouds and weather, a real-time world clock. *Made by AAxeL08.*

The finished app is a single HTML file (`dist/prism.html`), so it runs anywhere WebGL2 runs and can be published as one page.
The source is split into parts so it is easy to work on.

## Quick start

| What | Command |
| --- | --- |
| Build once | double-click `build.cmd`, or `node tools/build.mjs` (or `python tools/build.py`) |
| Develop | double-click `dev.cmd`, or `node tools/dev.mjs`, then open http://localhost:8080 (rebuilds and reloads the page on every save) |
| Test on this computer's GPU | `npm install` once, then `npm test` (screenshots go to `tests/out/`) |

You can also just open `dist/prism.html` from disk. The page needs a browser with WebGL2 and hardware acceleration turned on
(Chrome or Edge recommended; check `chrome://gpu` or `edge://gpu` if it says WebGL2 is not available).

Node 18 or newer is needed for the build and dev server (https://nodejs.org). Python 3 works for the plain build.

## Folders

```
Prism/
  project.json          title, version (stamped into the page), published artifact links
  package.json          npm scripts: build, dev, test
  src/
    page.html           the page: markup, with markers where the CSS and the script go
    css/style.css       all styles
    js/order.txt        the order the script parts are joined in (they share one function scope)
    js/app/             the app: settings, scenes, ray tracer, cosmos renderer, interface, camera, builder, photo mode
    js/planet/          the planet engine: terrain, weather and clouds, tiles and ground shading, air, runtime,
                        trees and shadows, grass, rocks
  tools/
    build.mjs           joins src/ into dist/prism.html and dist/prism-artifact.html
    build.py            the same build in Python
    dev.mjs             dev server with live reload
  tests/
    run.mjs, checks.mjs  automated checks in Edge/Chrome on the real GPU
  docs/
    ARCHITECTURE.md     how the planet engine works
  dist/                 build output (do not edit)
  CHANGELOG.md
```

## Working on it

* Edit files in `src/`, never in `dist/`.
* The script parts are pieces of one script, not modules: a part can use anything defined in another part. Keep the order
  in `src/js/order.txt` when adding a part (new planet engine parts go with the others under `js/planet/`).
* Shaders are GLSL strings inside the planet parts (`PE_TERRFS`, `PE_VOL`, ...). A shader error shows on screen with the
  program's name and the compiler's message.
* `window.__prism` exposes the app's state for debugging in the browser console (`__prism.PE` is the planet engine,
  `__prism.S` the settings).
* Bump `version` in `project.json` for every release; the page shows it with the credit line.

## Publishing

`dist/prism-artifact.html` is the page as published to claude.ai (links in `project.json`).
