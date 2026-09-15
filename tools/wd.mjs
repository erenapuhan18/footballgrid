/* Wikidata / Wikipedia yardımcıları — önbellekli (tools/.cache), 429/5xx'te bekleyip yeniden dener. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE = join(HERE, '.cache');
const UA = 'FootballGrid-databuilder/1.0 (local hobby project)';
mkdirSync(CACHE, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const Q = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
export const values = (ids) => ids.map((id) => 'wd:' + id).join(' ');
export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
export const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);

export async function getJSON(url, opts = {}, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) } });
      if (r.status === 429 || r.status >= 500) {
        const wait = Number(r.headers.get('retry-after')) || 2 ** i * 2;
        console.warn(`  HTTP ${r.status} → ${wait} sn bekleniyor`);
        await sleep(wait * 1000);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      console.warn('  hata, yeniden deneniyor:', String(e.message).slice(0, 140));
      await sleep(2500 * (i + 1));
    }
  }
  throw new Error(`${tries} denemede yanıt alınamadı: ${url.slice(0, 80)}`);
}

/** Anahtar → JSON dosyası önbelleği. */
export async function cached(key, fn) {
  const file = join(CACHE, 'k-' + createHash('sha1').update(key).digest('hex').slice(0, 20) + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const v = await fn();
  if (v !== null && v !== undefined) writeFileSync(file, JSON.stringify(v)); // başarısız yanıt önbelleğe girmesin
  return v;
}

/** SPARQL (build-data.mjs ile aynı önbellek anahtarı: sorgunun sha1'i). */
export async function sparql(query, label = '') {
  const key = createHash('sha1').update(query).digest('hex').slice(0, 20);
  const file = join(CACHE, key + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const t0 = Date.now();
  const j = await getJSON('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: 'query=' + encodeURIComponent(query),
  });
  const rows = j.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  writeFileSync(file, JSON.stringify(rows));
  if (label) console.log(`  ${label}: ${rows.length} satır, ${Date.now() - t0} ms`);
  await sleep(250);
  return rows;
}

export async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}
