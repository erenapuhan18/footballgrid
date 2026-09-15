/* Gerçek veritabanının sağlık raporu: tanınmışlık dağılımı, kulüp başına futbolcu,
   mod başına ızgara üretim başarısı/süresi ve örnek ızgaralar (hücre başına cevap sayısıyla).
   node tools/grid-stats.mjs */

import { fileURLToPath } from 'node:url';
import { FootballDB } from '../server/db.js';
import { makeGrid, MODES } from '../server/grid.js';

const t0 = performance.now();
const db = new FootballDB(fileURLToPath(new URL('../server/data/db.json', import.meta.url)));
console.log(`yükleme ${Math.round(performance.now() - t0)} ms · ${db.players.length} futbolcu · derleme ${db.builtAt}`);
console.log('sitelink eşikleri:', [3, 5, 10, 15, 20, 30, 50].map((s) => `≥${s}:${db.knownLimit(s)}`).join('  '));

const known = db.knownLimit(15);
const clubs = db.cats.filter((c) => c.type === 'club').map((c) => [c.name, c.tier, db.count(c, c), db.count(c, c, known)]);
clubs.sort((a, b) => a[3] - b[3]);
console.log('\nen az tanınmış futbolcusu olan kulüpler (tümü / sitelink≥15):');
for (const [n, t, all, k] of clubs.slice(0, 12)) console.log(`  ${t} ${n.padEnd(18)} ${String(all).padStart(5)} / ${k}`);
console.log('en kalabalıklar:', clubs.slice(-6).map(([n, , a, k]) => `${n} ${a}/${k}`).join(' · '));

const nats = db.cats.filter((c) => c.type === 'nat').map((c) => [c.name, db.count(c, c, known)]).sort((a, b) => a[1] - b[1]);
console.log('\nuyruk (sitelink≥15) en az:', nats.slice(0, 8).map(([n, k]) => `${n} ${k}`).join(' · '));
console.log('lig:', db.cats.filter((c) => c.type === 'lg').map((c) => `${c.name} ${db.count(c, c, known)}`).join(' · '));
console.log('mevki:', db.cats.filter((c) => c.type === 'pos').map((c) => `${c.name} ${db.count(c, c, known)}`).join(' · '));

for (const [mode, size] of [['klasik', 3], ['klasik', 4], ['hizli', 3], ['uzman', 3], ['uzman', 4]]) {
  let fail = 0;
  const freq = new Map();
  const t = performance.now();
  const N = 150;
  let sample;
  for (let i = 0; i < N; i++) {
    try {
      const g = makeGrid(db, mode, size);
      sample = g;
      for (const c of [...g.rows, ...g.cols]) freq.set(c.name, (freq.get(c.name) || 0) + 1);
    } catch {
      fail++;
    }
  }
  const ms = (performance.now() - t) / N;
  const top = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, k]) => `${n}×${k}`).join(' ');
  console.log(`\n■ ${mode} ${size}×${size}: ${N - fail}/${N} üretildi · ${ms.toFixed(1)} ms/ızgara · farklı başlık ${freq.size}`);
  console.log('  en sık:', top);
  const lim = db.knownLimit(MODES[mode].knownSl);
  console.log('  örnek:     ' + sample.cols.map((c) => c.name.padEnd(16)).join(''));
  for (const r of sample.rows) {
    const cells = sample.cols.map((c) => {
      const a = db.answers(r, c, 1)[0];
      return `${db.count(r, c, lim)}·${(a?.name || '-').slice(0, 11)}`.padEnd(16);
    });
    console.log(`  ${r.name.slice(0, 10).padEnd(10)} ${cells.join('')}`);
  }
}

const tq = performance.now();
for (const q of ['hagi', 'alex', 'ronaldo', 'icardi', 'mertens', 'arda', 'sneijder', 'drogba', 'messi', 'ozil']) db.search(q);
console.log(`\narama: 10 sorgu ${Math.round(performance.now() - tq)} ms`);
for (const q of ['hagi', 'alex de', 'ronaldo', 'icardi', 'ozil', 'rüştü']) console.log(`  "${q}" →`, db.search(q, 5).map((x) => `${x.name}${x.by ? ' ' + x.by : ''}${x.alias ? ' [' + x.alias + ']' : ''}`).join(' | '));
