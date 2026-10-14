// Prepares the Windows app in desktop/: builds the site, copies it into desktop/app and sets the app's version and
// the GitHub repository its updates come from (both from project.json, or from GitHub Actions when it runs there).
//   node tools/desktop.mjs            prepare only (then: cd desktop && npm install && npm start)
//   node tools/desktop.mjs --check    also fail unless the pushed tag (GITHUB_REF_NAME) is v<release>
import fs from 'node:fs';
import path from 'node:path';
import {build, root} from './build.mjs';

build();
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'project.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(cfg.release || '')) throw new Error('project.json "release" must be a version like 1.2.3');
const tag = process.env.GITHUB_REF_NAME;
if (process.argv.includes('--check') && tag && tag !== 'v' + cfg.release) throw new Error(`tag ${tag} does not match project.json release ${cfg.release} (expected v${cfg.release})`);
const [owner, repo] = (process.env.GITHUB_REPOSITORY || cfg.repo || '/').split('/');
const dir = path.join(root, 'desktop'), pj = path.join(dir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
pkg.version = cfg.release;
pkg.build.publish = [{provider: 'github', owner: owner || 'OWNER', repo: repo || 'REPO', releaseType: 'release'}];
fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + '\n');
const app = path.join(dir, 'app');
fs.rmSync(app, {recursive: true, force: true});
fs.cpSync(path.join(root, 'dist/site'), app, {recursive: true});
console.log(`desktop app ${cfg.release} prepared (updates from ${owner || '?'}/${repo || '?'})`);
