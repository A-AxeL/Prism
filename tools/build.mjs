// Builds Prism from src/ into dist/ (no dependencies, Node 18+).
//   node tools/build.mjs            build once
//   node tools/build.mjs --watch    rebuild whenever a file in src/ or project.json changes
// Outputs
//   dist/prism.html            a complete page: open it straight from disk, or serve it (tools/dev.mjs)
//   dist/prism-artifact.html   the same page without the document wrapper, for publishing as a claude.ai artifact
//   dist/prism-dev.html        the page the dev server serves: no textures inside (it loads them from assets/textures)
//   dist/site/                 the website (GitHub Pages) and the desktop app's content: index.html, textures, version.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

export function build({quiet = false} = {}) {
  const t0 = Date.now();
  const cfg = JSON.parse(rd('project.json'));
  // the app script: every part in order.txt, joined into one function scope
  const order = rd('src/js/order.txt').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  let js = order.map(f => rd('src/js/' + f)).join('');
  if (!/const VERSION='[^']*';/.test(js)) throw new Error('VERSION constant not found');
  js = js.replace(/const VERSION='[^']*';/, `const VERSION='${cfg.version}';`);
  // the build id: a hash of the sources, so the website can tell a newer page from the one that is open
  const buildId = crypto.createHash('sha1').update(js + rd('src/css/style.css') + rd('src/page.html')).digest('hex').slice(0, 10);
  const q = v => JSON.stringify(String(v || '')).replace(/"/g, "'");
  js = js.replace(/const BUILD='[^']*',BENCH_URL='[^']*',REPO='[^']*';/, `const BUILD=${q(buildId)},BENCH_URL=${q(cfg.benchmarkUrl)},REPO=${q(cfg.repo)};`);
  // release notes shown in the app after an update: RELEASE_NOTES.md, "## <release> (date)" headings, "- " items
  const notes = [];
  if (fs.existsSync(path.join(root, 'RELEASE_NOTES.md'))) for (const line of rd('RELEASE_NOTES.md').split('\n')) {
    const h = line.match(/^## +(\d+\.\d+\.\d+)(?: +\(([^)]*)\))?/);
    if (h) notes.push({v: h[1], date: h[2] || '', items: []});
    else if (notes.length && /^- /.test(line)) notes[notes.length - 1].items.push(line.slice(2).trim());
    else if (notes.length && /^ +\S/.test(line) && notes[notes.length - 1].items.length) notes[notes.length - 1].items.push(notes[notes.length - 1].items.pop() + ' ' + line.trim());
  }
  js = js.replace(/const RELEASE='[^']*',NOTES=\[\];/, () => `const RELEASE=${q(cfg.release)},NOTES=${JSON.stringify(notes).replace(/<\//g, '<\\/')};`);
  let page = rd('src/page.html');
  for (const [mark, text] of [['\n/*@@CSS@@*/\n', rd('src/css/style.css')], ['\n/*@@JS@@*/\n', js]]) {
    if (!page.includes(mark)) throw new Error('marker missing in src/page.html: ' + mark.trim());
    page = page.replace(mark, () => text);
  }
  page = page.replace(/<title>[^<]*<\/title>/, `<title>${cfg.title}</title>`);
  // the photo textures (assets/textures, made by tools/textures.html): embedded so the page works from disk and as one file;
  // the full page takes the 1024 px versions, the artifact (16 MB limit) only the 512 px ones
  const texDir = path.join(root, 'assets/textures'), man = path.join(texDir, 'manifest.json');
  const texScript = small => {
    if (!fs.existsSync(man)) return '';
    const manifest = JSON.parse(fs.readFileSync(man, 'utf8')), files = {};
    for (const role of Object.keys(manifest)) for (const k of ['a', 'n']) {
      const f = `${role}_${k}${small ? '5' : ''}.webp`, full = path.join(texDir, f);
      if (fs.existsSync(full)) files[f] = 'data:image/webp;base64,' + fs.readFileSync(full).toString('base64');
    }
    return `<script>window.PRISM_TEX=${JSON.stringify({manifest, files})};</script>\n`;
  };
  const pageBig = page.replace('<script>', () => texScript(false) + '<script>'), pageSmall = page.replace('<script>', () => texScript(true) + '<script>');
  fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
  fs.writeFileSync(path.join(root, 'dist/prism-artifact.html'), pageSmall);
  const doc = p => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + p + '</body></html>';
  fs.writeFileSync(path.join(root, 'dist/prism.html'), doc(pageBig));
  fs.writeFileSync(path.join(root, 'dist/prism-dev.html'), doc(page));
  // the website (GitHub Pages): the dev page as index.html beside the textures, plus version.json for the update check
  const site = path.join(root, 'dist/site');
  fs.rmSync(site, {recursive: true, force: true});
  fs.mkdirSync(path.join(site, 'assets/textures'), {recursive: true});
  fs.writeFileSync(path.join(site, 'index.html'), doc(page).replace('<head>', '<head><meta name="description" content="' + (cfg.description || '') + '"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg">'));
  if (fs.existsSync(texDir)) for (const f of fs.readdirSync(texDir)) if (/^manifest\.json$|\.webp$/.test(f)) fs.copyFileSync(path.join(texDir, f), path.join(site, 'assets/textures', f));
  const web = path.join(root, 'web');   // static extras: icon, web manifest
  if (fs.existsSync(web)) for (const g of fs.readdirSync(web)) fs.copyFileSync(path.join(web, g), path.join(site, g));
  fs.writeFileSync(path.join(site, 'version.json'), JSON.stringify({version: cfg.version, release: cfg.release, build: buildId}) + '\n');
  fs.writeFileSync(path.join(site, '.nojekyll'), '');
  if (!quiet) console.log(`built ${cfg.title} ${cfg.version}: ${order.length} parts, ${(pageBig.length / 1048576).toFixed(1)} MB (artifact ${(pageSmall.length / 1048576).toFixed(1)} MB) in ${Date.now() - t0} ms`);
  return page;
}

export function watch(onBuilt) {
  let timer = null;
  const again = () => { clearTimeout(timer); timer = setTimeout(() => { try { build(); onBuilt && onBuilt(); } catch (e) { console.error('build failed:', e.message); } }, 120); };
  fs.watch(path.join(root, 'src'), {recursive: true}, again);
  fs.mkdirSync(path.join(root, 'assets'), {recursive: true});fs.watch(path.join(root, 'assets'), {recursive: true}, again);
  fs.watch(path.join(root, 'project.json'), again);
  console.log('watching src/ for changes');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build();
  if (process.argv.includes('--watch')) watch();
}
