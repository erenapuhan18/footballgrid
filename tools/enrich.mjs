/* FOOTBALLGRID zenginleştirme — build-data.mjs'in ürettiği tabanın üstüne:
   · kariyer dönemleri (P54 + başlangıç/bitiş tarihleri)
   · kupalar (Şampiyonlar Ligi, Avrupa Ligi, Dünya Kupası, EURO, lig şampiyonlukları)
   · menajerler (kulüp/milli takım teknik direktör dönemleriyle çakışma → "X ile çalışmış")
   · jokerler (Ballon d'Or, Dünya Kupası'nda oynamak, doğum yılı, 5+ takım, sonradan teknik direktör)
   · güncel kadrolar (futbol-sim-2627'nin elle doğrulanmış 2026-27 kadroları)

   node tools/enrich.mjs      (npm run data:enrich) — taban server/data/db.base.json'da saklanır */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUBS, NATIONS, LEAGUES, COMPETITIONS, WILDCARDS, SIM_CLUBS, SIM_NATIONS, SIM_POS } from './catalog.mjs';
import { sparql, pool, values, chunk, push, Q, getJSON, cached, sleep } from './wd.mjs';
import { fold } from '../server/text.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'server', 'data', 'db.json');
const BASE = join(ROOT, 'server', 'data', 'db.base.json');
const R = JSON.parse(readFileSync(join(HERE, 'resolved.json'), 'utf8'));
const SIM_DIR = process.env.SIM_DIR || join(ROOT, '..', 'futbol-sim-2627', 'src', 'data', 'players');
const NOW = 2026.7;
const KNOWN_SL = 15;

/* ───────── 0) taban */

let base = JSON.parse(readFileSync(OUT, 'utf8'));
if (base.enriched) base = JSON.parse(readFileSync(BASE, 'utf8'));
else writeFileSync(BASE, JSON.stringify(base));

const P = base.players.map(([name, by, sl, clubs, nats, leagues, pos, aliases, qid]) => ({
  name, by, sl, qid, pos, aliases: aliases || [],
  clubs: new Set(clubs), nats: new Set(nats), leagues: new Set(leagues),
  cups: new Set(), mgrs: new Set(), wild: new Set(), stints: [], raw: [],
}));
const byQid = new Map(P.filter((p) => p.qid).map((p) => [p.qid, p]));
console.log(`taban: ${P.length} futbolcu`);

// takım anahtarı: katalog kulübü → 'c<i>', milli takım → 'n<i>', diğerleri → QID
const teamKey = new Map();
CLUBS.forEach((c, i) => [R.clubs[c[0]].qid, ...(R.clubs[c[0]].extra || [])].forEach((q) => teamKey.set(q, 'c' + i)));
NATIONS.forEach((n, i) => R.nt[n[0]] && teamKey.set(R.nt[n[0]].qid, 'n' + i));
const tk = (q) => teamKey.get(q) || q;

/** Wikidata tarihi → kesirli yıl. Yalnızca yıl hassasiyetli kayıtlar 1 Ocak görünür:
    başlangıç → yaz (Temmuz), bitiş → sezon sonu (Haziran) varsayılır. */
function yr(iso, isEnd) {
  if (!iso) return null;
  const m = /^\+?(-?\d{1,4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo === 1 && d === 1) return y + (isEnd ? 0.45 : 0.55);
  return y + (mo - 1) / 12 + (d - 1) / 365;
}

/* ───────── 1) kariyer dönemleri + ödüller/katılımlar (QID sırasına göre sabit partiler) */

const qids = [...byQid.keys()].sort();
const batches = chunk(qids, 600);
const extras = new Map(); // qid → [{k:'a'|'e', v}]
console.log(`» ${batches.length} parti: dönem + ödül`);
await pool(batches, 3, async (b, bi) => {
  const V = values(b);
  const tag = `parti ${bi + 1}/${batches.length}`;
  for (const r of await sparql(
    `SELECT ?p ?c ?s ?e WHERE { VALUES ?p { ${V} } ?p p:P54 ?st . ?st ps:P54 ?c . OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } }`,
    tag + ' dönem',
  )) byQid.get(Q(r.p))?.raw.push({ c: Q(r.c), s: r.s || null, e: r.e || null });
  for (const r of await sparql(
    `SELECT ?p ?k ?v WHERE { VALUES ?p { ${V} } { ?p wdt:P166 ?v . BIND("a" AS ?k) } UNION { ?p wdt:P1344 ?v . BIND("e" AS ?k) } }`,
    tag + ' ödül',
  )) if (r.v.startsWith('http')) push(extras, Q(r.p), { k: r.k, v: Q(r.v) });
});

for (const p of P) {
  for (const r of p.raw) p.stints.push({ key: tk(r.c), q: r.c, ps: yr(r.s, false), pe: yr(r.e, true) });
  delete p.raw;
  // Bitiş tarihi eksik kulüp dönemi, bir sonraki kulübün başladığı yerde biter (Arda Güler FB → Real).
  // Sonrası yoksa: yakın tarihliyse hâlâ orada, eskiyse ~2,5 yıl sürmüş say.
  const club = p.stints.filter((st) => st.ps !== null && !st.key.startsWith('n')).sort((a, b) => a.ps - b.ps);
  for (const st of p.stints) {
    if (st.ps === null || st.pe !== null) continue;
    const next = st.key.startsWith('n') ? null : club.find((x) => x !== st && x.ps > st.ps + 0.2 && x.key !== st.key);
    st.pe = next ? next.ps : st.ps >= 2019 ? NOW : st.ps + 2.5;
  }
}

/* ───────── 2) güncel kadrolar (futbol-sim-2627) */

function readSim() {
  const out = [];
  for (const f of ['superlig-a.ts', 'superlig-b.ts', 'superlig-c.ts', 'europe.ts']) {
    const file = join(SIM_DIR, f);
    if (!existsSync(file)) continue;
    let club = null;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const head = /^\s*([a-z0-9]+):\s*\[\s*$/.exec(line);
      if (head) {
        club = head[1];
        continue;
      }
      const m = /^\s*\['((?:[^'\\]|\\.)*)',\s*'([A-Z]+)',\s*(\d+),\s*'([A-Z]{3})'/.exec(line);
      if (m && club && SIM_CLUBS[club]) out.push({ club: SIM_CLUBS[club], name: m[1].replace(/\\'/g, "'"), pos: m[2], age: Number(m[3]), nat: m[4] });
    }
  }
  return out;
}

const sim = readSim();
const nameIdx = new Map();
for (const p of P) for (const nm of [p.name, ...p.aliases]) push(nameIdx, fold(nm), p);
let simMatched = 0;
let simAdded = 0;
let simNewClub = 0;
for (const s of sim) {
  const ci = CLUBS.findIndex((c) => c[0] === s.club);
  const by = 2026 - s.age;
  const ni = NATIONS.findIndex((n) => n[0] === SIM_NATIONS[s.nat]);
  const cands = nameIdx.get(fold(s.name)) || [];
  let p =
    cands.find((x) => x.by && Math.abs(x.by - by) <= 1) ||
    cands.find((x) => ni >= 0 && x.nats.has(ni)) ||
    (cands.length === 1 ? cands[0] : null);
  if (p) simMatched++;
  else {
    p = {
      name: s.name, by, sl: 2, qid: null, pos: SIM_POS[s.pos] ?? 0, aliases: [],
      clubs: new Set(), nats: new Set(ni >= 0 ? [ni] : []), leagues: new Set(),
      cups: new Set(), mgrs: new Set(), wild: new Set(), stints: [],
    };
    P.push(p);
    push(nameIdx, fold(s.name), p);
    simAdded++;
  }
  if (!p.clubs.has(ci)) {
    p.clubs.add(ci);
    simNewClub++;
  }
  const li = LEAGUES.findIndex((l) => l[0] === CLUBS[ci][7]);
  if (li >= 0) p.leagues.add(li);
  const key = 'c' + ci;
  if (!p.stints.some((st) => st.key === key && st.pe >= 2026.5)) p.stints.push({ key, q: null, ps: 2026.55, pe: NOW });
}
console.log(`güncel kadro: ${sim.length} oyuncu · eşleşen ${simMatched} · yeni eklenen ${simAdded} · kulübü güncellenen ${simNewClub}`);

const byTeam = new Map(); // takım anahtarı → [{p, st}]
for (const p of P) for (const st of p.stints) if (st.ps !== null) push(byTeam, st.key, { p, st });

/* ───────── 3) teknik direktör dönemleri → menajer kategorileri */

console.log('» teknik direktörler');
const coachRows = await sparql(
  `SELECT ?t ?m ?s ?e WHERE { VALUES ?t { ${values([...teamKey.keys()])} } ?t p:P286 ?st . ?st ps:P286 ?m . OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } }`,
  'teknik direktör dönemleri',
);
const coachSet = new Set(coachRows.map((r) => Q(r.m)));
const under = new Map(); // menajer → Set(futbolcu)
for (const r of coachRows) {
  const cs = yr(r.s, false);
  if (cs === null) continue;
  let ce = yr(r.e, true);
  if (ce === null) ce = cs >= 2023 ? NOW : cs + 2;
  const m = Q(r.m);
  for (const { p, st } of byTeam.get(tk(Q(r.t))) || []) {
    if (Math.min(st.pe, ce) - Math.max(st.ps, cs) > 0.15) (under.get(m) || under.set(m, new Set()).get(m)).add(p);
  }
}
const knownCount = (set) => [...set].filter((p) => p.sl >= KNOWN_SL).length;
// Türk büyüklerini ya da milli takımı çalıştırmış hocalar ayrıca korunur (Klasik'te de çıksınlar)
const TURK_TEAMS = new Set([...['gs', 'fb', 'bjk', 'ts'].map((k) => 'c' + CLUBS.findIndex((c) => c[0] === k)), 'n' + NATIONS.findIndex((n) => n[0] === 'tr')]);
const turkMgr = new Set(coachRows.filter((r) => TURK_TEAMS.has(tk(Q(r.t)))).map((r) => Q(r.m)));
const mgrCands = [...under].map(([m, set]) => [m, set, knownCount(set)]).filter(([m, , k]) => k >= 10 || (turkMgr.has(m) && k >= 6));
const mgrMeta = new Map();
for (const c of chunk(mgrCands.map(([m]) => m), 300)) {
  for (const r of await sparql(
    `SELECT ?m ?sl ?l_tr ?l_en ?l_mul WHERE { VALUES ?m { ${values(c)} } ?m wikibase:sitelinks ?sl .
      OPTIONAL { ?m rdfs:label ?l_tr FILTER(LANG(?l_tr) = "tr") } OPTIONAL { ?m rdfs:label ?l_en FILTER(LANG(?l_en) = "en") }
      OPTIONAL { ?m rdfs:label ?l_mul FILTER(LANG(?l_mul) = "mul") } }`,
    'menajer adları',
  )) mgrMeta.set(Q(r.m), { sl: Number(r.sl), name: r.l_tr || r.l_en || r.l_mul || null });
}
const ranked = mgrCands.filter(([m]) => mgrMeta.get(m)?.name).sort((a, b) => b[2] - a[2]);
const managers = [...ranked.slice(0, 90), ...ranked.slice(90).filter(([m]) => turkMgr.has(m))].map(([m, set, k]) => {
  const meta = mgrMeta.get(m);
  const klasik = turkMgr.has(m) ? k >= 12 : meta.sl >= 40 && k >= 15;
  return { key: m, qid: m, name: meta.name, tier: klasik ? 'k' : 'u', set, known: k };
});
managers.forEach((mg, i) => mg.set.forEach((p) => p.mgrs.add(i)));

/* ───────── 4) kupalar */

function labelYear(lbl) {
  if (!lbl) return null;
  const two = /(\d{4})\s*[–-]\s*(\d{2,4})\b/.exec(lbl);
  if (two) {
    let end = Number(two[2]);
    if (two[2].length === 2) end = Math.floor(Number(two[1]) / 100) * 100 + end + (end < Number(two[1]) % 100 ? 100 : 0);
    return end + 0.4;
  }
  const one = /\b(\d{4})\b/.exec(lbl);
  return one ? Number(one[1]) + 0.55 : null;
}

// Wikipedia bilgi kutusundaki "champions/winners" satırını takım anahtarına çevir
const clubNames = CLUBS.map((c, i) => [i, [R.clubs[c[0]].label, c[1], c[2]].filter(Boolean).map(fold).filter((s) => s.length >= 4)]);
const ntNames = NATIONS.map((n, i) => [i, [n[3].replace(/ (men's )?national.*$/i, ''), R.nt[n[0]]?.label?.replace(/ (men's )?national.*$/i, '')].filter(Boolean).map(fold)]);
function matchTeam(text, kind) {
  const t = fold(text);
  let best = null;
  for (const [i, names] of kind === 'nt' ? ntNames : clubNames) {
    for (const nm of names) if (t.includes(nm) && (!best || nm.length > best.len)) best = { key: (kind === 'nt' ? 'n' : 'c') + i, len: nm.length };
  }
  return best?.key || null;
}
async function wikiWinner(label, kind) {
  const title = label.replace(/(\d{4})-(\d{2})\b/, '$1–$2');
  const j = await cached('wp:' + title, async () => {
    await sleep(300);
    return getJSON('https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&section=0&redirects=1&page=' + encodeURIComponent(title), {}, 3).catch(() => null);
  });
  const wt = j?.parse?.wikitext?.['*'] || '';
  const m = /\|\s*(?:champions|winners|champion)\s*=\s*([^\n]*)/i.exec(wt);
  if (!m) return null;
  const links = [...m[1].matchAll(/\[\[([^\]|]+)/g)].map((x) => x[1]).filter((x) => !/^(file|image):/i.test(x));
  return matchTeam(links[0] || m[1], kind);
}

console.log('» kupalar');
const edParticipants = new Map(); // turnuva QID → [futbolcu]
for (const [q, list] of extras) for (const x of list) if (x.k === 'e' && byQid.get(q)) push(edParticipants, x.v, byQid.get(q));
const wcEditions = new Set();
let wikiFilled = 0;
const cupReport = [];
for (const [ci, comp] of COMPETITIONS.entries()) {
  const [key, , , src, kind] = comp;
  const cq = src.startsWith('lg:') ? R.leagues[src.slice(3)]?.qid : src;
  if (!cq) continue;
  const rows = await sparql(
    `SELECT ?s ?w ?d ?e ?lbl WHERE { ?s wdt:P3450 wd:${cq} . OPTIONAL { ?s wdt:P1346 ?w } OPTIONAL { ?s wdt:P585 ?d } OPTIONAL { ?s wdt:P582 ?e } OPTIONAL { ?s rdfs:label ?lbl . FILTER(LANG(?lbl) = "en") } }`,
    'kupa ' + key,
  );
  const seasons = new Map();
  for (const r of rows) {
    const s = seasons.get(r.s) || seasons.set(r.s, { q: Q(r.s), winners: new Set(), d: r.d, e: r.e, lbl: r.lbl }).get(r.s);
    if (r.w?.startsWith('http')) s.winners.add(Q(r.w));
  }
  let won = 0;
  let seasonsUsed = 0;
  for (const s of seasons.values()) {
    if (s.lbl && /qualif|group|round|play-?off|final|squad/i.test(s.lbl)) continue;
    if (key === 'wc') wcEditions.add(s.q);
    const D = yr(s.e, true) ?? yr(s.d, true) ?? labelYear(s.lbl);
    if (!D || D > NOW) continue;
    let winKeys = [...s.winners].map(tk).filter((k) => (kind === 'nt' ? k.startsWith('n') : !k.startsWith('n')) && !/^Q\d+$/.test(k) || (kind === 'club' && /^Q\d+$/.test(k) && byTeam.has(k)));
    if (!winKeys.length && D >= 1990 && s.lbl) {
      const w = await wikiWinner(s.lbl, kind);
      if (w) {
        winKeys = [w];
        wikiFilled++;
      }
    }
    if (!winKeys.length) continue;
    seasonsUsed++;
    for (const wk of winKeys) {
      let winners = [];
      if (kind === 'club') {
        winners = (byTeam.get(wk) || []).filter(({ st }) => st.ps <= D && D <= st.pe).map(({ p }) => p);
      } else {
        const ni = Number(wk.slice(1));
        // Önce oyuncunun oynadığı milli takım; uyruk yalnızca milli takım bilgisi hiç yoksa
        // (çifte vatandaş Crespo/Agüero/Higuaín başka ülkenin kupasını almasın).
        const plays = (p) => p.stints.some((st) => st.key === wk);
        const noNt = (p) => !p.stints.some((st) => st.key.startsWith('n'));
        winners = (edParticipants.get(s.q) || []).filter((p) => plays(p) || (noNt(p) && p.nats.has(ni)));
        // Katılım kaydı zayıf turnuvalarda (ör. 2022) milli takım dönemine düş
        if (winners.length < 12) {
          const fall = (byTeam.get(wk) || []).filter(({ st }) => st.ps <= D && D <= st.pe && st.pe - st.ps < 12).map(({ p }) => p);
          winners = [...new Set([...winners, ...fall])];
        }
      }
      for (const p of winners) p.cups.add(ci);
      won += winners.length;
    }
  }
  cupReport.push(`${key}:${seasonsUsed} sezon/${won}`);
}
console.log('  ' + cupReport.join(' · ') + ` · Wikipedia'dan tamamlanan kazanan: ${wikiFilled}`);

/* ───────── 5) jokerler */

const W = Object.fromEntries(WILDCARDS.map((w, i) => [w[0], i]));
const WC_I = COMPETITIONS.findIndex((c) => c[0] === 'wc');
for (const p of P) {
  const ex = (p.qid && extras.get(p.qid)) || [];
  if (ex.some((x) => x.k === 'a' && x.v === 'Q166177')) p.wild.add(W.ballon);
  if (ex.some((x) => x.k === 'e' && wcEditions.has(x.v)) || p.cups.has(WC_I)) p.wild.add(W.wcplay);
  if (p.by && p.by >= 2000) p.wild.add(W.y2000);
  if (p.by && p.by < 1980) p.wild.add(W.pre1980);
  if (new Set(p.stints.filter((st) => !st.key.startsWith('n')).map((st) => st.q || st.key)).size >= 8) p.wild.add(W.clubs8);
  if (p.qid && coachSet.has(p.qid)) p.wild.add(W.coach);
}

/* ───────── 6) yaz */

P.sort((a, b) => b.sl - a.sl);
const arr = (s) => [...s].sort((a, b) => a - b);
function clubYears(p) {
  return arr(p.clubs)
    .map((ci) => {
      const sts = p.stints.filter((st) => st.key === 'c' + ci && st.ps !== null);
      if (!sts.length) return [ci, null, null];
      const end = Math.max(...sts.map((s) => s.pe));
      return [ci, Math.floor(Math.min(...sts.map((s) => s.ps))), end >= NOW - 0.05 ? 0 : Math.floor(end)];
    })
    .sort((a, b) => (a[1] ?? 9999) - (b[1] ?? 9999));
}
const db = {
  ...base,
  enriched: true,
  enrichedAt: new Date().toISOString(),
  source: base.source + ' · teknik direktör P286, katılım P1344, ödül P166, sezon kazananı P1346 (+Wikipedia) · 2026-27 kadroları futbol-sim-2627',
  cups: COMPETITIONS.map((c) => ({ key: c[0], name: c[1], short: c[2], tier: c[5], desc: c[6], fail: c[7] })),
  managers: managers.map((m) => ({ key: m.key, name: m.name, tier: m.tier })),
  wilds: WILDCARDS.map((w) => ({ key: w[0], name: w[1], desc: w[2], fail: w[3], tier: w[4] })),
  // 13. alan: oyuncu kartı için katalog kulüplerindeki yıllar [kulüp, başlangıç|null, bitiş|0=hâlâ|null]
  players: P.map((p) => [
    p.name, p.by, p.sl, arr(p.clubs), arr(p.nats), arr(p.leagues), p.pos, p.aliases, p.qid,
    arr(p.cups), arr(p.mgrs), arr(p.wild), clubYears(p),
  ]),
};
writeFileSync(OUT, JSON.stringify(db));
console.log(`\n✔ ${P.length} futbolcu → ${OUT} (${Math.round(JSON.stringify(db).length / 1024)} KB)`);

/* ───────── 7) akıl sağlığı raporu */

const ci = (k) => CLUBS.findIndex((c) => c[0] === k);
const cupI = (k) => COMPETITIONS.findIndex((c) => c[0] === k);
const mgrI = (name) => managers.findIndex((m) => fold(m.name).includes(fold(name)));
const show = (label, test) => console.log(`  ${label.padEnd(26)}: ${P.filter(test).slice(0, 7).map((p) => p.name).join(', ')}`);
show('FB × Mourinho', (p) => p.clubs.has(ci('fb')) && p.mgrs.has(mgrI('Mourinho')));
show('GS × Süper Lig şampiyonu', (p) => p.clubs.has(ci('gs')) && p.cups.has(cupI('tr1')));
show('BJK × Süper Lig şampiyonu', (p) => p.clubs.has(ci('bjk')) && p.cups.has(cupI('tr1')));
show('Real Madrid × ŞL', (p) => p.clubs.has(ci('rma')) && p.cups.has(cupI('ucl')));
show('Dünya Kupası (Arjantin)', (p) => p.cups.has(cupI('wc')) && p.nats.has(NATIONS.findIndex((n) => n[0] === 'ar')));
show("Ballon d'Or", (p) => p.wild.has(W.ballon));
show('FB (güncel)', (p) => p.stints.some((st) => st.key === 'c' + ci('fb') && st.pe >= NOW - 0.01));
show('BJK (güncel)', (p) => p.stints.some((st) => st.key === 'c' + ci('bjk') && st.pe >= NOW - 0.01));
console.log('  kupa sayıları   :', COMPETITIONS.map((c, i) => `${c[0]}:${P.filter((p) => p.cups.has(i) && p.sl >= KNOWN_SL).length}`).join(' '));
console.log('  joker sayıları  :', WILDCARDS.map((w, i) => `${w[0]}:${P.filter((p) => p.wild.has(i) && p.sl >= KNOWN_SL).length}`).join(' '));
console.log('  Türk hocalar    :', ['Fatih Terim', 'Şenol Güneş', 'Mustafa Denizli', 'Okan Buruk', 'Sergen Yalçın', 'Aykut Kocaman', 'İsmail Kartal', 'Abdullah Avcı', 'Ersun Yanal'].map((n) => { const m = managers.find((x) => fold(x.name) === fold(n)); return m ? `${m.name}${m.tier === 'k' ? '' : '°'} ${m.known}` : n + ' yok'; }).join(' · '));
show('Crespo/Agüero WC?', (p) => ['Hernán Crespo', 'Sergio Agüero', 'Gonzalo Higuaín'].includes(p.name) && p.cups.has(cupI('wc')));
show('Arda Güler × Mourinho?', (p) => p.name === 'Arda Güler' && p.mgrs.has(mgrI('Mourinho')));
console.log('  menajerler (tanınmış oyuncu):', managers.slice(0, 30).map((m) => `${m.name}${m.tier === 'k' ? '' : '°'} ${m.known}`).join(' · '));
