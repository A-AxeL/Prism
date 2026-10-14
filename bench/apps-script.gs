/**
 * Prism performance survey: receives results from the app and adds them to this spreadsheet.
 * Setup: see bench/README.md. Paste this whole file into Extensions › Apps Script of a new Google Sheet,
 * deploy it as a web app (Execute as: Me, Who has access: Anyone) and put the /exec URL in project.json "benchmarkUrl".
 *
 * Sheets (created on first use):
 *   Runs     one row per survey: the device, the score, and the full JSON
 *   Results  one row per test, for filtering and pivot tables
 */
const MAX_BYTES = 400000;

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_BYTES) return out_({ok: false, error: 'empty or too large'});
    const r = JSON.parse(raw);
    if (r.schema !== 1 || !Array.isArray(r.results) || !r.system || !r.runId) return out_({ok: false, error: 'not a Prism survey'});
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const runs = sheet_(ss, 'Runs', ['Received', 'Run ID', 'Time', 'Version', 'Build', 'Shell', 'Suite', 'Complete', 'Seconds', 'Score',
        'GPU (WebGL)', 'GPU vendor', 'GPU (system)', 'GPU driver', 'Driver date', 'VRAM MB', 'CPU', 'Threads', 'RAM GB', 'OS', 'Firmware',
        'Board', 'System', 'Browser', 'Screen', 'JSON']);
      if (runs.createTextFinder(String(r.runId)).matchEntireCell(true).findNext()) return out_({ok: true, duplicate: true});
      const s = r.system, d = s.desktop || {}, g0 = (d.gpu && d.gpu[0]) || {}, ch = (s.browser && s.browser.client) || {};
      const brands = (ch.fullVersionList || []).filter(b => !/Not.?A.?Brand/i.test(b.brand)).map(b => b.brand + ' ' + b.version).join(', ');
      const os = d.os && d.os.name || (ch.platform ? ch.platform + ' ' + (ch.platformVersion || '') : '');
      runs.appendRow([new Date(), r.runId, r.time, s.app && s.app.version, s.app && s.app.build, s.app && s.app.shell, r.suite, r.complete, r.durationS, r.score,
        s.gpu && s.gpu.renderer, s.gpu && s.gpu.vendor, g0.name || '', g0.driver || '', g0.driverDate || '', g0.vramMB || '',
        (d.cpu && (d.cpu.name || d.cpu.model)) || '', (s.cpu && s.cpu.threads) || (d.cpu && d.cpu.threads) || '', d.ramGB || (s.memory && s.memory.gb) || '',
        os, d.firmware ? [d.firmware.vendor, d.firmware.version, d.firmware.date].filter(Boolean).join(' ') : '',
        d.board ? [d.board.vendor, d.board.model].join(' ') : '', d.system ? [d.system.vendor, d.system.model].join(' ') : '',
        brands || (s.browser && s.browser.ua) || '', s.display ? s.display.w + 'x' + s.display.h + ' @' + s.display.dpr : '',
        raw.slice(0, 49000)]);
      const res = sheet_(ss, 'Results', ['Run ID', 'Version', 'GPU (WebGL)', 'Section', 'Test', 'Scene', 'View', 'Preset', 'Method', 'Settings',
        'Width', 'Height', 'Scale', 'Median ms', 'P90 ms', 'P99 ms', 'Average ms', 'FPS (median)', 'FPS (wall)', 'Frames', 'Shader build ms', 'Failed']);
      const rows = r.results.slice(0, 500).map(x => [r.runId, s.app && s.app.version, s.gpu && s.gpu.renderer, x.sec, x.label, x.scene, x.view, x.preset, x.mode,
        JSON.stringify(x.set || {}), x.res && x.res[0], x.res && x.res[1], x.scale, x.medMs, x.p90Ms, x.p99Ms, x.avgMs,
        x.medMs > 0 ? Math.round(1000 / x.medMs) : '', x.fpsWall, x.frames, x.buildMs, x.broken]);
      if (rows.length) res.getRange(res.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    } finally {
      lock.releaseLock();
    }
    return out_({ok: true});
  } catch (err) {
    return out_({ok: false, error: String(err)});
  }
}

function doGet() {
  return out_({ok: true, service: 'Prism performance survey'});
}

function sheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  }
  return sh;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
