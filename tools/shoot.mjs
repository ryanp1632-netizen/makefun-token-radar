// Screenshots of the built dashboard with headless Chrome over the DevTools protocol (no npm packages).
//   node tools/shoot.mjs <output dir that main.ts wrote> <screenshots dir> [chrome.exe]
// Each shot is a hash route of out/dashboard/index.html, captured at 1440 px wide as JPEG, kept under 270 KB so four fit the 1.5 MiB dossier.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [outDir, shotDir, chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'] = process.argv.slice(2);
const SHOTS = [
  ['1-board.jpg', '#/board', 1000],
  ['2-detail.jpg', '#/p/' + (process.env.DETAIL || 'figure-markets-prime'), 1280],
  ['3-filtered.jpg', '#/board?tier=early&s=odds', 1000],
  ['4-model.jpg', '#/model', 820],
].slice(0, Number(process.env.SHOTS || 4));

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'radar-shot-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  await sleep(200);
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {}
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

const base = pathToFileURL(resolve(outDir, 'dashboard', 'index.html')).href;
await send('Page.enable');
for (const [name, hash, height] of SHOTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + hash });
  await sleep(900);
  const evald = await send('Runtime.evaluate', { expression: `document.querySelector('.check')?.textContent + ' | ' + document.title`, returnByValue: true });
  let q = 90, data;
  do {
    data = Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: q, captureBeyondViewport: false })).result.data, 'base64');
    q -= 4;
  } while (data.length > 270_000 && q > 50);
  writeFileSync(join(shotDir, name), data);
  console.log(`${name}: ${hash} ${(data.length / 1024).toFixed(0)} KB q${q + 4} ${evald.result?.result?.value}`);
}
ws.close();
proc.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
