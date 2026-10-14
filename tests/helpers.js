// Console helpers for testing in the browser (dev server): fetch('/tests/helpers.js').then(r=>r.text()).then(eval)
// T.scene('blue planet'), T.stand(dir,{h,pitch}), T.fps(ms), T.turn(seconds), T.stats(), T.preset('pc')
window.T = (() => {
  const P = window.__prism, PE = P.PE, sleep = ms => new Promise(r => setTimeout(r, ms));
  const settle = async () => { while (document.body.classList.contains('busy') || !PE.P || PE.fr < 5) await sleep(100); };
  const T = {
    sleep, settle,
    async scene(n) { if (P.S.scene !== n) { P.S.scene = n; P.changed('scene'); } await settle(); },
    async preset(p) { if (P.S.preset !== p) { P.S.preset = p; P.changed('preset'); } await settle(); },
    spots: {forest: [0.9130978484451158, 0.17364817766693033, 0.36891547752548204], savanna: [0.9622501868990583, 0.25881904510252074, 0.08418598282936916], mars: [0.5, 0.3, 0.812]},
    stand(dir, {h = 1.7, pitch = 0, yaw = 0} = {}) {
      const g = PE.cfg; P.peProbe(g, dir, true); P.peProbe(g, dir, true);
      const hb = Math.max(PE.pr.h, PE.pr.wl), eye = dir.map(v => v * (1 + hb + h / (g.R * 1000)));
      const E = [dir[2], 0, -dir[0]], L = Math.hypot(...E), e1 = E.map(v => v / L), e2 = [dir[1] * e1[2] - dir[2] * e1[1], dir[2] * e1[0] - dir[0] * e1[2], dir[0] * e1[1] - dir[1] * e1[0]];
      T.frame = {dir, e1, e2};
      P.S.camMode = 'fly'; P.changed('camMode'); Object.assign(P.cam, {px: eye[0], py: eye[1], pz: eye[2]}); P.cam.ref = null;
      T.look(yaw, pitch); P.reset(); return {ground_m: Math.round(hb * g.R * 1000), T: PE.pr.T, W: PE.pr.W};
    },
    look(yaw, pitch = 0) { const {dir, e1, e2} = T.frame; P.flyAim(e1.map((v, i) => v * Math.cos(yaw) + e2[i] * Math.sin(yaw) + dir[i] * pitch)); },
    fps: (ms = 2000) => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); }),
    // turn a full circle in s seconds; report how the selected tiles changed
    turn(s = 6, pitch = -.05) { return new Promise(res => { const log = [], t0 = performance.now(); const f = () => { const t = (performance.now() - t0) / (s * 1000); if (t > 1) { const tk = log.map(x => x.tk); res({frames: log.length, tkMin: Math.min(...tk), tkMax: Math.max(...tk), needMax: Math.max(...log.map(x => x.need)), selMax: Math.max(...log.map(x => x.sel)), slots: PE.nslot, coarseFrames: log.filter(x => x.need > 0).length}); return; }
      T.look(t * 2 * Math.PI, pitch); log.push({tk: +PE.tk.toFixed(2), need: PE.stat.need, sel: PE.selN}); requestAnimationFrame(f); }; requestAnimationFrame(f); }); },
    // the sun's heading in the frame of the last T.stand (radians, as T.look takes it)
    sunYaw() { const {e1, e2} = T.frame, s = PE.sun; return Math.atan2(s[0] * e2[0] + s[1] * e2[1] + s[2] * e2[2], s[0] * e1[0] + s[1] * e1[1] + s[2] * e1[2]); },
    // stand at dir and look off degrees from the sun's heading (90: side lit, 180: sun behind, 0: toward the sun)
    async view(dir, off = 90, pitch = .2, h = 30, wait = 2500) { T.stand(dir, {h}); T.look(T.sunYaw() + off * Math.PI / 180, pitch); await sleep(wait); return T.stats(); },
    // places with a given weather and sun elevation: f({cov, ty, pr, ci, el, la, lo, land}) -> true
    findWx(f, h = 90) { const M = P.peWxMap(h), m = M.d, sun = PE.sun, out = [];
      for (let j = 0; j < h; j++) for (let i = 0; i < 2 * h; i++) { const k = (j * 2 * h + i) * 4, la = -90 + (j + .5) * 180 / h, lo = (i + .5) * 360 / (2 * h), d = P.peDir(la, lo);
        const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const o = {cov: m[k], ty: m[k + 1], pr: sm(.55, .85, m[k]) * (.25 + .75 * m[k + 1]), z: m[k + 2] * 6, ci: m[k + 3], el: Math.asin(d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2]) * 180 / Math.PI, la, lo, d};
        if (f(o)) { o.land = P.peLandAt(la, lo); out.push(o); } } return out; },
    // show a texture region (or the frame, HDR, scaled to its brightest green) magnified over the page; T.unmag() removes it
    magTex(tex, x, y, w, h, k = 4) { const gl = document.querySelector('canvas').getContext('webgl2'), fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); const p = new Float32Array(w * h * 4); gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, p);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.deleteFramebuffer(fb); return T.show(p, w, h, k); },
    mag(x, y, w, h, k = 4) { return new Promise(r => requestAnimationFrame(() => { const gl = document.querySelector('canvas').getContext('webgl2'); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, P.rtF());
      const p = new Float32Array(w * h * 4); gl.readPixels(x, gl.drawingBufferHeight - y - h, w, h, gl.RGBA, gl.FLOAT, p); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); r(T.show(p, w, h, k)); })); },
    show(p, w, h, k) { let mx = 0; for (let i = 0; i < p.length; i += 4) mx = Math.max(mx, p[i + 1]);
      let c = document.getElementById('magc'); if (!c) { c = document.createElement('canvas'); c.id = 'magc'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;image-rendering:pixelated;border:2px solid red'; document.body.appendChild(c); }
      c.width = w; c.height = h; c.style.width = w * k + 'px'; c.style.height = h * k + 'px'; const x2 = c.getContext('2d'), im = x2.createImageData(w, h), tm = v => 255 * Math.pow(Math.min(1, Math.max(0, v) / mx), 1 / 2.2);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const s = ((h - 1 - j) * w + i) * 4, d = (j * w + i) * 4; im.data[d] = tm(p[s]); im.data[d + 1] = tm(p[s + 1]); im.data[d + 2] = tm(p[s + 2]); im.data[d + 3] = 255; }
      x2.putImageData(im, 0, 0); return mx; },
    // after a reload: load, pick the pc preset and a scene, stand somewhere and look (yaw off the sun, pitch); frames only render
    // while something changes, so redraw() forces fresh ones
    async go(scene, dir, h = 12, off = 2.0, pitch = -1.2, wait = 6000) { await T.preset('pc'); await T.scene(scene); T.stand(dir, {h}); T.look(T.sunYaw() + off, pitch); await sleep(wait); return T.redraw(); },
    async redraw(ms = 1200) { P.reset(); await sleep(ms); return T.stats(); },
    unmag() { const c = document.getElementById('magc'); if (c) c.remove(); },
    stats: () => ({preset: P.S.preset, tiles: PE.stat && PE.stat.n, slots: PE.nslot, tk: +PE.tk.toFixed(2), trees: PE.vegStat, grass: PE.grsStat, rocks: PE.rckStat, err: document.getElementById('err').textContent.slice(0, 200)}),
  };
  return T;
})();
'helpers loaded'
