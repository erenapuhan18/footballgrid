/* Boy verisi (Wikidata P2048) → server/data/heights.json  ·  node tools/heights.mjs [--stats]

   Ayrı dosya, çünkü `data:enrich` db.json'u db.base.json üstüne yeniden yazıyor; boylar öyle kaybolmasın.
   Değerler normalleştirilmiş (psn: → metre) alınır, santimetreye çevrilir; en iyi rütbeli ifade kullanılır.
   Sorgular tools/.cache'e yazıldığı için ikinci koşu ağa gitmez. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sparql, values, chunk, Q } from './wd.mjs';

const DB = fileURLToPath(new URL('../server/data/db.json', import.meta.url));
const OUT = fileURLToPath(new URL('../server/data/heights.json', import.meta.url));
const MIN_CM = 140;
const MAX_CM = 230;

const raw = JSON.parse(readFileSync(DB, 'utf8'));
const qids = [...new Set(raw.players.map((p) => p[8]).filter((q) => /^Q\d+$/.test(q)))];
console.log(`${raw.players.length} futbolcu · ${qids.length} Wikidata kimliği`);

const out = {};
let odd = 0;
const parts = chunk(qids, 1200);
for (const [i, part] of parts.entries()) {
  const rows = await sparql(
    `SELECT ?p ?m WHERE { VALUES ?p { ${values(part)} } ?p p:P2048 ?s . ?s a wikibase:BestRank ; psn:P2048/wikibase:quantityAmount ?m . }`,
  );
  for (const r of rows) {
    const cm = Math.round(Number(r.m) * 100);
    if (!(cm >= MIN_CM && cm <= MAX_CM)) {
      odd++;
      continue;
    }
    const qid = Q(r.p);
    // Aynı kişide birden çok ifade olabilir (yıllara göre) — en büyüğü yetişkin boyu sayılır
    out[qid] = Math.max(out[qid] || 0, cm);
  }
  process.stdout.write(`\r  ${i + 1}/${parts.length} parti · ${Object.keys(out).length} boy`);
}
console.log(`\nboyu bilinen: ${Object.keys(out).length} (%${Math.round((Object.keys(out).length * 100) / qids.length)})${odd ? ` · ${odd} akla yatmayan değer atıldı` : ''}`);

writeFileSync(OUT, JSON.stringify(out));
console.log(`yazıldı: ${OUT} (${Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024)} KB)`);

/* ───────── dağılım: hangi eşikler başlık olmaya yeter? */

const sl = new Map(raw.players.map((p) => [p[8], p[2]]));
const known = Object.entries(out).filter(([q]) => (sl.get(q) || 0) >= 15);
const all = Object.values(out).sort((a, b) => a - b);
const pct = (n) => all[Math.floor((all.length * n) / 100)];
console.log(`\nboy dağılımı: ortanca ${pct(50)} cm · %10 ${pct(10)} · %90 ${pct(90)} · en kısa ${all[0]} · en uzun ${all.at(-1)}`);
console.log('eşikler (tümü / tanınmış sl≥15):');
for (const cm of [200, 195, 190, 185]) {
  console.log(`  ≥${cm}: ${all.filter((h) => h >= cm).length} / ${known.filter(([, ], i) => known[i][1] >= cm).length}`);
}
for (const cm of [180, 175, 172, 170, 165]) {
  console.log(`  ≤${cm}: ${all.filter((h) => h <= cm).length} / ${known.filter((k) => k[1] <= cm).length}`);
}
