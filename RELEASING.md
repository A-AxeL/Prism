# Publishing Prism

Prism ships two ways, both from this repository on GitHub:

- **Website** (GitHub Pages): every push to `main` rebuilds and publishes it. Open pages check `version.json`
  and offer a reload when a new build is out.
- **Windows app** (Electron, NSIS installer): pushing a tag `v<release>` builds the installer and publishes a GitHub Release.
  Installed apps check for updates at start and every 4 hours, download in the background and offer **Restart to update**.

## One-time setup

1. Run `setup-github.cmd` once: it copies the workflows from `ci/workflows` to `.github/workflows`.
   Then create a GitHub repository (for example `prism`) and push this folder to its `main` branch:
   ```
   git init -b main
   git add .
   git commit -m "Prism"
   git remote add origin https://github.com/<you>/prism.git
   git push -u origin main
   ```
2. In the repository: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
   The site appears at `https://<you>.github.io/prism/` after the **Website** workflow finishes.
3. In `project.json`, set `"repo": "<you>/prism"` (the website then links to the Windows app) and,
   after following `bench/README.md`, `"benchmarkUrl"`.
4. For auto-updates the repository must be **public** (the app reads releases without a token).

## Releasing a new version

1. Raise `"release"` in `project.json` (for example `0.45.9` → `0.46.0`); also update `"version"` and `CHANGELOG.md`.
2. Commit and push to `main` (this also updates the website).
3. Tag and push the tag:
   ```
   git tag v0.46.0
   git push origin v0.46.0
   ```
   The **Desktop release** workflow builds `Prism-Setup-0.46.0.exe` with `latest.yml` and publishes the release.
   The tag must match `release`, or the workflow stops.

## Building the app locally

```
node tools/desktop.mjs
cd desktop
npm install
npm start          # run it
npm run dist       # make the installer in desktop/dist
```

## Unsigned builds

The installer is not code-signed, so Windows SmartScreen shows "Windows protected your PC" the first time:
users click **More info › Run anyway**. Updates install without that prompt. To sign later, add a certificate
(`CSC_LINK` and `CSC_KEY_PASSWORD` secrets) and electron-builder signs automatically.
