/* Tek ekranın hızlı görüntüsü — arayüzle uğraşırken ui-check turunu beklememek için.
   node tools/snap.mjs [yol] [çıktı-adı]      örn: node tools/snap.mjs / home  */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { writeFixtureDb } from '../test/helpers.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '_shots');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Git Bash '/' argumanini Windows yoluna cevirir (MSYS) - C:\... geldiyse koke don
const path = (process.argv[2] || '/').replace(/^[A-Za-z]:[\/].*/, '/');
const name = process.argv[3] || 'snap';

const realDb = join(HERE, '..', 'server', 'data', 'db.json');
const app = createApp({ dbFile: existsSync(realDb) && !process.env.FIXTURE ? realDb : writeFixtureDb(5), joinLimit: 10_000 });
const port = await app.listen(0, '127.0.0.1');
const base = `http://localhost:${port}`;
console.log('sunucu', base + path, '·', app.db.players.length, 'futbolcu');

const cdpPort = 9800 + Math.floor(Math.random() * 150);
const profile = mkdtempSync(join(tmpdir(), 'fg-snap-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let browserWs;
for (let i = 0; i < 80 && !browserWs; i++) {
  try {
    browserWs = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    await sleep(150);
  }
}
const ws = new WebSocket(browserWs);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let msgId = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}, sessionId) =>
  new Promise((ok, fail) => {
    const id = ++msgId;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function shoot(width, height, mobile, file, setup = '') {
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
  await s('Page.navigate', { url: base + path });
  await s('Runtime.evaluate', {
    expression: `(async () => { const wait = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = typeof fn === 'string' ? document.querySelector(fn) : fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('yok'); await new Promise((r) => setTimeout(r, 40)); } };
      await wait(() => document.readyState === 'complete' && document.querySelector('#app .screen')); ${setup} })()`,
    awaitPromise: true,
  });
  await sleep(900); // açılış animasyonları otursun
  const { cssContentSize } = await s('Page.getLayoutMetrics');
  const h = Math.min(4000, Math.ceil(cssContentSize.height));
  const img = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.max(h, height), scale: 1 } });
  writeFileSync(join(OUT, file), Buffer.from(img.data, 'base64'));
  console.log('→', join(OUT, file));
}

await shoot(390, 844, true, `${name}-mobil.png`);
await shoot(1280, 860, false, `${name}-masaustu.png`);
if (errors.length) console.log('JS hatası:', errors.join(' | '));
ws.close();
chrome.kill();
await app.close?.();
process.exit(0);
