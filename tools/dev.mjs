// (restart it after changing tools/build.mjs: the server keeps the build it started with)
// Development server: builds, serves the project at http://localhost:8080 and reloads the page whenever a source file changes.
//   node tools/dev.mjs [port]        (dev.cmd runs it and restarts it whenever this file changes)
// Open http://localhost:8080 in Chrome or Edge (hardware acceleration on). The page reloads by itself after every save.
// POST /__save?path=assets/...  writes the request body to that file (only under assets/ and tests/out/): the texture
// pipeline (tools/textures.html) and tests save their results this way.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, watch, root} from './build.mjs';

const port = +(process.argv[2] || 8080);
const newest = d => fs.readdirSync(d, {withFileTypes: true}).reduce((m, e) => Math.max(m, e.isDirectory() ? newest(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).mtimeMs), 0);
const clients = new Set();
const reloader = `<script>(()=>{const es=new EventSource('/__reload');es.onmessage=()=>location.reload();})();</script>`;
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8'};
try { build(); } catch (e) { console.error('build failed:', e.message); }
watch(() => { for (const c of clients) c.write('data: reload\n\n'); });
// a change to this server itself: exit, and dev.cmd starts the new version
const self = fileURLToPath(import.meta.url), selfT = fs.statSync(self).mtimeMs;
// (after a pause, so files saved alongside it, such as build.mjs, are complete when the new one starts)
let quit = null;
fs.watch(self, () => { try { if (fs.statSync(self).mtimeMs !== selfT && !quit) { console.log('dev server changed: restarting'); quit = setTimeout(() => process.exit(3), 1500); } } catch (e) {} });

http.createServer((req, res) => {
  const [u, q = ''] = req.url.split('?'), url = decodeURIComponent(u), params = new URLSearchParams(q);
  if (url === '/__reload') {
    res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive'});
    res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url === '/__save' && req.method === 'POST') {
    const rel = (params.get('path') || '').replace(/\\/g, '/'), full = path.join(root, rel);
    if (!/^(assets|tests\/out)\//.test(rel) || rel.includes('..') || !full.startsWith(root)) { res.writeHead(403); res.end('not allowed'); return; }
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', () => { fs.mkdirSync(path.dirname(full), {recursive: true}); fs.writeFileSync(full, Buffer.concat(chunks)); res.writeHead(200); res.end('saved ' + rel); console.log('saved', rel); });
    return;
  }
  const file = url === '/' ? 'dist/prism-dev.html' : url.slice(1);
  // rebuild on request when a source is newer than the page (in case a file change was missed by the watcher)
  if (file === 'dist/prism-dev.html') { try { if (Math.max(newest(path.join(root, 'src')), fs.existsSync(path.join(root, 'assets')) ? newest(path.join(root, 'assets')) : 0) > fs.statSync(path.join(root, file)).mtimeMs) build(); } catch (e) { console.error('build failed:', e.message); } }
  const full = path.join(root, file);
  if (!full.startsWith(root) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  let body = fs.readFileSync(full);
  if (file === 'dist/prism-dev.html') body = body.toString().replace('</body>', reloader + '</body>');
  res.writeHead(200, {'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  res.end(body);
}).listen(port, () => console.log(`Prism dev server: http://localhost:${port}`));
