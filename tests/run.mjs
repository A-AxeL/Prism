// Prism test run on this computer's real GPU (Edge or Chrome), with Playwright.
//   npm install            (once: fetches Playwright; the browsers it drives are the ones already installed)
//   npm test               all checks, screenshots in tests/out/
//   npm test -- ground     only the checks whose name contains "ground"
// Each check loads dist/prism.html (built first), drives it through window.__prism and reports errors, fps and timings.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {build, root} from '../tools/build.mjs';
import {checks} from './checks.mjs';

build();
const out = path.join(root, 'tests/out');
fs.mkdirSync(out, {recursive: true});
const only = process.argv[2] || '';
const page_url = 'file:///' + path.join(root, 'dist/prism.html').replace(/\\/g, '/');
// PRISM_BROWSER: msedge (default) or chrome, the browsers already on this computer; 'software' runs Playwright's own
// browser on the CPU (no GPU: very slow, for machines without one)
const channel = process.env.PRISM_BROWSER || 'msedge';
let failed = 0;
const browser = channel === 'software'
  ? await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']})
  : await chromium.launch({channel, headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization']});
for (const c of checks) {
  if (only && !c.name.includes(only)) continue;
  const ctx = await browser.newContext({viewport: c.viewport || {width: 1280, height: 800}});
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(channel === 'software' ? 900000 : 180000);
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { const t = m.text(); if (/GL_INVALID|INVALID_|did not compile|Shader error|rror/.test(t) && !/Failed to load resource/.test(t)) errs.push(t.slice(0, 300)); });
  await pg.addInitScript(st => { localStorage.setItem('prism3', JSON.stringify(st)); localStorage.setItem('prism-ui', JSON.stringify({hint: true})); }, Object.assign({adaptive: false}, c.store || {}));
  const t0 = Date.now();
  let res;
  try {
    await pg.goto(page_url, {waitUntil: 'commit', timeout: 120000});
    await pg.waitForFunction(() => window.__prism && window.__prism.S, null, {timeout: 120000});
    res = await c.run(pg, {out, name: c.name});
  } catch (e) { errs.push('check threw: ' + e.message.split('\n')[0]); }
  const ok = !errs.length && (!res || res.ok !== false);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  ${res ? JSON.stringify(res.info || {}) : ''}${errs.length ? '\n      ' + errs.slice(0, 5).join('\n      ') : ''}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
