/* Herkese açık geçici bağlantı: sunucuyu başlatır ve Cloudflare "hızlı tünel" açar.
   Hesap gerekmez; her çalıştırmada rastgele bir https://….trycloudflare.com adresi gelir.
   Lobideki davet linki ve QR kod otomatik olarak bu adresi kullanır.

   npm run public      (Ctrl+C ile kapat) */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { startFromCli } from '../server/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(HERE, 'bin');
const EXE = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
const ASSET = { win32: 'cloudflared-windows-amd64.exe', linux: 'cloudflared-linux-amd64' }[process.platform];

async function ensureCloudflared() {
  const local = join(BIN_DIR, EXE);
  if (existsSync(local)) return local;
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim().split(/\r?\n/)[0];
  if (!ASSET) throw new Error('cloudflared bulunamadı. macOS için: brew install cloudflared');
  console.log('  cloudflared indiriliyor (yalnızca ilk sefer, ~50 MB)…');
  mkdirSync(BIN_DIR, { recursive: true });
  const res = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${ASSET}`);
  if (!res.ok) throw new Error(`cloudflared indirilemedi: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(local));
  if (process.platform !== 'win32') chmodSync(local, 0o755);
  return local;
}

const app = await startFromCli();
const bin = await ensureCloudflared();
console.log('  Tünel açılıyor…');
const cf = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${app.state.port}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let url = null;
const scan = (buf) => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || url) return;
  url = m[0];
  app.setPublicUrl(url);
  console.log(`\n  🌍 Herkese açık adres: ${url}`);
  console.log('     Arkadaşların bu adresten ya da lobideki QR koddan katılır.');
  console.log('     Adres bu pencere açık kaldıkça çalışır. Kapatmak için Ctrl+C.\n');
};
cf.stdout.on('data', scan);
cf.stderr.on('data', scan);
cf.on('exit', (code) => {
  console.log(`  Tünel kapandı (${code ?? 'sinyal'}).`);
  app.setPublicUrl(null);
});

const stop = () => cf.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
