// The checks run by tests/run.mjs. Each gets a Playwright page with dist/prism.html loaded and returns {ok, info}.
// Helpers drive the app through window.__prism (a debugging hook the page exposes).

// wait until the shaders are built and the planet engine has settled (tiles made, background programs compiled)
async function settle(pg, {extras = true, timeout = 180000} = {}) {
  await pg.waitForFunction(() => !document.body.classList.contains('busy'), null, {timeout});
  await pg.waitForFunction(x => { const P = window.__prism, PE = P.PE; if (!PE.P) return false;
    return PE.fr > 5 && PE.pending === 0 && (!x || ((!PE.xq || !PE.xq.length) && (!PE.xrun || !PE.xrun.length))); }, extras, {timeout, polling: 250});
}
// frames per second over a few seconds of real rendering
async function fps(pg, ms = 3000) {
  return pg.evaluate(ms => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); }), ms);
}
// put the camera on the ground of the current planet: dir (unit vector from the planet's center), eye height (m), look pitch
async function stand(pg, dir, {h = 1.7, pitch = 0} = {}) {
  return pg.evaluate(([dir, h, pitch]) => {
    const P = window.__prism, PE = P.PE, g = PE.cfg; P.peProbe(g, dir, true); P.peProbe(g, dir, true);
    const hb = Math.max(PE.pr.h, PE.pr.wl), eye = dir.map(v => v * (1 + hb + h / (g.R * 1000)));
    const E = [dir[2], 0, -dir[0]], L = Math.hypot(...E), aim = E.map((v, i) => v / L + dir[i] * pitch);
    P.S.camMode = 'fly'; P.changed('camMode'); Object.assign(P.cam, {px: eye[0], py: eye[1], pz: eye[2]}); P.cam.ref = null; P.flyAim(aim); P.reset();
    document.getElementById('ui').style.display = 'none'; return {ground_m: Math.round(hb * g.R * 1000), T: PE.pr.T, W: PE.pr.W};
  }, [dir, h, pitch]);
}
const scene = (pg, name, extra = {}) => pg.evaluate(([n, x]) => { const P = window.__prism; P.S.scene = n; P.changed('scene'); for (const k in x) { P.S[k] = x[k]; P.changed(k); } }, [name, extra]);
const shot = (pg, o, name) => pg.screenshot({path: `${o.out}/${name}.png`});
const stats = pg => pg.evaluate(() => { const PE = window.__prism.PE; return {trees: PE.vegStat || null, grass: PE.grsStat || null, rocks: PE.rckStat || null, tiles: PE.stat ? PE.stat.n : 0, programs: Object.keys(PE.P || {}).length}; });

// known spots on the blue planet (unit vectors from its center)
const FOREST = [0.9130978484451158, 0.17364817766693033, 0.36891547752548204];
const SAVANNA = [0.9622501868990583, 0.25881904510252074, 0.08418598282936916];

export const checks = [
  {name: 'startup', run: async (pg, o) => { await pg.waitForTimeout(3000); await shot(pg, o, 'startup'); return {info: {fps: await fps(pg)}}; }},
  {name: 'planet-orbit', run: async (pg, o) => {
    const t0 = Date.now(); await scene(pg, 'blue planet'); await settle(pg); const ready = Date.now() - t0;
    await pg.waitForTimeout(2000); await shot(pg, o, 'planet-orbit');
    return {info: {ready_ms: ready, fps: await fps(pg), ...(await stats(pg))}};
  }},
  {name: 'ground-forest', run: async (pg, o) => {
    await scene(pg, 'blue planet'); await settle(pg); const at = await stand(pg, FOREST, {pitch: .05});
    await settle(pg); await pg.waitForTimeout(4000); await shot(pg, o, 'ground-forest');
    const st = await stats(pg); return {ok: !!(st.trees && st.trees.mesh), info: {...at, fps: await fps(pg), ...st}};
  }},
  {name: 'ground-savanna', run: async (pg, o) => {
    await scene(pg, 'blue planet'); await settle(pg); const at = await stand(pg, SAVANNA, {pitch: -.12});
    await settle(pg); await pg.waitForTimeout(4000); await shot(pg, o, 'ground-savanna');
    const st = await stats(pg); return {ok: !!(st.grass && st.grass.near), info: {...at, fps: await fps(pg), ...st}};
  }},
  {name: 'ground-mars', run: async (pg, o) => {
    await scene(pg, 'dust world'); await settle(pg); const at = await stand(pg, [0.5, 0.3, 0.812], {pitch: -.08});
    await settle(pg); await pg.waitForTimeout(4000); await shot(pg, o, 'ground-mars');
    const st = await stats(pg); return {info: {...at, fps: await fps(pg), ...st}};
  }},
  {name: 'timelapse', run: async (pg, o) => {
    await scene(pg, 'blue planet', {animate: true, timeSpeed: 21600}); await settle(pg);
    const w0 = await pg.evaluate(() => window.__prism.PE.wt); await pg.waitForTimeout(5000); const w1 = await pg.evaluate(() => window.__prism.PE.wt);
    await shot(pg, o, 'timelapse'); return {ok: w1 > w0, info: {hours_passed: +((w1 - w0) / 3600).toFixed(1), fps: await fps(pg)}};
  }},
  {name: 'all-scenes', run: async (pg, o) => {
    const names = await pg.evaluate(() => Object.keys(window.__prism.SCENES)); const bad = [];
    for (const n of names) { await scene(pg, n); try { await pg.waitForFunction(() => !document.body.classList.contains('busy'), null, {timeout: 120000}); } catch { bad.push(n + ' (timeout)'); }
      await pg.waitForTimeout(800); const e = await pg.evaluate(() => document.getElementById('err').textContent); if (e) bad.push(n + ': ' + e.slice(0, 120)); }
    return {ok: !bad.length, info: {scenes: names.length, bad}};
  }},
];
