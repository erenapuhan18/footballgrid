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
import { CLUBS, NATIONS, LEAGUES, COMPETITIONS, WILDCARDS, TREBLES, SIM_CLUBS, SIM_NATIONS, SIM_POS } from './catalog.mjs';
import { sparql, pool, values, chunk, push, Q, getJSON, cached, sleep } from './wd.mjs';
import { enTitles, infoboxes, titleQids, leagueSeasons, span } from './wiki.mjs';
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

/* ───────── 1b) Wikipedia bilgi kutusu: A takım kariyeri
   Wikidata P54 altyapı ve B takımı dönemlerini de ana kulübe yazabiliyor, yeni transferlerde de geride kalıyor.
   Bilgi kutusu güvenilirse (satırların çoğu Wikidata'ya eşlenebiliyorsa) kulüp dönemleri ondan alınır;
   milli takım dönemleri Wikidata'dan kalır. */

console.log('» Wikipedia bilgi kutuları');
const titleOf = await enTitles(qids);
const IB = await infoboxes([...titleOf.values()], { log: console.log });
const ibLinks = new Set();
for (const ib of IB.values()) {
  if (!ib) continue;
  ib.c.forEach((x) => x[0] && ibLinks.add(x[0]));
  ib.y.forEach((t) => ibLinks.add(t));
  ib.n.forEach((x) => ibLinks.add(x[0]));
}
const QOF = await titleQids([...ibLinks], { log: console.log });
// Doğum yılı 3'ten fazla tutmuyorsa madde başka birine ait (Nicolás López 1993 ↔ 1925): o kutu hiç kullanılmaz.
// Wikidata'daki yıl akla yatmıyorsa (Quaresma "1000") bu kontrol atlanır.
const ibMismatch = new Set();
function ibOf(p) {
  const ib = p.qid && titleOf.has(p.qid) ? IB.get(titleOf.get(p.qid)) : null;
  if (ib && ib.by && p.by && p.by >= 1850 && Math.abs(ib.by - p.by) > 3) {
    ibMismatch.add(p);
    return null;
  }
  return ib;
}
// Bağlantısız satır adı kulübü korur — ama "Eintracht Frankfurt II", "Real Madrid Castilla" gibi yedek/altyapı takımı değilse
const RESERVE = /\b(ii|iii|b|c|u\d{2}|reserves?|amateure?|jugend|youth|juvenil|primavera|castilla|atletic|mestalla|academy)\b/;
const clubNameSet = CLUBS.map((c) => [R.clubs[c[0]].label, c[1], c[2]].filter(Boolean).map(fold).filter((s) => s.length >= 4));
let wpUsed = 0;
let wpAdd = 0;
const wpDropped = []; // [futbolcu, kulüp] — rapor için
for (const p of P) {
  const ib = ibOf(p);
  if (!ib || !ib.c.length) continue;
  const rows = ib.c.map(([t, label, a, b, loan]) => ({ q: (t && QOF.get(t)) || null, label: fold(label), a, b, loan }));
  const mapped = rows.filter((r) => r.q);
  if (mapped.length / rows.length < 0.6) continue;
  wpUsed++;
  const stints = mapped.map((r) => {
    const sp = span(r.a, r.b, NOW);
    return { key: tk(r.q), q: r.q, ps: sp ? sp[0] : null, pe: sp ? sp[1] : null, loan: !!r.loan };
  });
  const wpCat = new Set(stints.filter((s) => s.key.startsWith('c')).map((s) => Number(s.key.slice(1))));
  // bağlantısız satırın adı katalog kulübüne uyuyorsa o kulüp silinmez, Wikidata dönemi korunur
  const unlinked = rows.filter((r) => !r.q && !RESERVE.test(r.label)).map((r) => r.label);
  const byLabel = (ci) => unlinked.some((l) => clubNameSet[ci].some((nm) => l === nm || l.startsWith(nm + ' ')));
  for (const ci of [...p.clubs]) {
    if (wpCat.has(ci) || byLabel(ci)) continue;
    p.clubs.delete(ci);
    wpDropped.push([p, ci]);
  }
  for (const ci of wpCat) {
    if (p.clubs.has(ci)) continue;
    p.clubs.add(ci);
    wpAdd++;
  }
  const keepWd = p.stints.filter((st) => st.key.startsWith('n') || (st.key.startsWith('c') && !wpCat.has(Number(st.key.slice(1))) && p.clubs.has(Number(st.key.slice(1)))));
  p.stints = [...stints, ...keepWd];
}
console.log(`  ${wpUsed} futbolcuda kullanıldı · katalog kulübü eklenen ${wpAdd} · silinen ${wpDropped.length}`);

/* ───────── 1c) uyruk = temsil ettiği milli takım
   Vatandaşlık listesi (P27) oyunda yanıltıyordu: Messi "İtalya", Vinícius "İspanya", Mbappé "Kamerun" sayılıyordu.
   A milli takımda oynadıysa yalnız o ülke(ler); hiç oynamadıysa altyapı milli takımı. Yalnız katalog dışı bir
   A takımında oynadıysa (Yugoslavya, Yeşil Burun …) vatandaşlık kalır ki bulunabilsin. */

const natOfNt = new Map(NATIONS.map((n, i) => [R.nt[n[0]]?.qid, i]).filter(([q]) => q));
const natByName = new Map(NATIONS.map((n, i) => [fold(n[3].replace(/ (men's )?national.*$/i, '')), i]));
const SENIOR_NT = /national (association )?football team$/i;
const NOT_SENIOR = /under-?\d|\bU-?\d|\bB\b|olympic|amateur|futsal|beach|youth|women|reserve|military|universit/i;
let natChanged = 0;
for (const p of P) {
  const senior = new Set(p.stints.filter((st) => st.key.startsWith('n')).map((st) => Number(st.key.slice(1))));
  const youth = new Set();
  let elsewhere = false;
  const ib = ibOf(p);
  for (const [t] of ib?.n || []) {
    const q = QOF.get(t);
    if (q && natOfNt.has(q)) senior.add(natOfNt.get(q));
    else if (SENIOR_NT.test(t) && !NOT_SENIOR.test(t)) elsewhere = true;
    else {
      const ni = natByName.get(fold(t.replace(/ (men's )?(national|olympic).*$/i, '')));
      if (ni !== undefined) youth.add(ni);
    }
  }
  const next = senior.size ? senior : !elsewhere && youth.size ? youth : null;
  if (!next) continue;
  if (next.size !== p.nats.size || [...next].some((n) => !p.nats.has(n))) natChanged++;
  p.nats = next;
}
console.log(`  uyruk = temsil ettiği milli takım: ${natChanged} futbolcuda değişti`);

/* ───────── 1d) doğum yılı: Wikidata'da yoksa, akla yatmıyorsa (Quaresma "1000") ya da bilgi kutusundan farklıysa
   (Pepe 1984 ↔ 1983 — Wikidata'da iki tarih var, ilki alınıyordu) bilgi kutusundaki yıl geçerli. */

let byFixed = 0;
for (const p of P) {
  const ib = ibOf(p);
  if (ib?.by && ib.by !== p.by) {
    p.by = ib.by;
    byFixed++;
  } else if (p.by !== null && (p.by < 1850 || p.by > 2012)) {
    p.by = null;
    byFixed++;
  }
}
console.log(`  doğum yılı: ${byFixed} futbolcuda düzeltildi`);

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

// Yazım farkı eşleştirmesi (Levent/Münir Levent Mercan, Mohamed/Muhammed Salah, Eljif/Elif Elmas, Ben/Benjamin White):
// aynı soyad + doğum yılı ±1 + (biliniyorsa) aynı uyruk + benzer ilk ad; tek aday varsa.
const words = (s) => fold(s).split(/[\s-]+/).filter(Boolean);
const surIdx = new Map();
for (const p of P) push(surIdx, words(p.name).at(-1), p);
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return d[b.length];
}
const similar = (a, b) =>
  a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) || lev(a, b) <= (Math.min(a.length, b.length) >= 6 ? 2 : 1);
function fuzzyMatch(name, by, ni) {
  const w = words(name);
  if (w.length < 2) return null;
  const hits = (surIdx.get(w.at(-1)) || []).filter((x) => {
    if (!x.by || Math.abs(x.by - by) > 1) return false;
    const xw = words(x.name).slice(0, -1);
    return w.slice(0, -1).some((f) => xw.some((g) => similar(f, g)));
  });
  // Uyruk zorunlu değil, yalnız ayırt edici: Almanya'da doğup Türkiye'yi seçenlerde kadro ile kayıt tutmayabiliyor
  if (hits.length > 1 && ni >= 0) {
    const same = hits.filter((x) => x.nats.has(ni));
    if (same.length === 1) return same[0];
  }
  return hits.length === 1 ? hits[0] : null;
}

let simMatched = 0;
let simFuzzy = 0;
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
  if (!p && (p = fuzzyMatch(s.name, by, ni))) {
    simFuzzy++;
    if (!p.aliases.includes(s.name)) p.aliases.push(s.name); // aramada kadrodaki yazımla da bulunsun
    push(nameIdx, fold(s.name), p);
  }
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
console.log(`güncel kadro: ${sim.length} oyuncu · eşleşen ${simMatched} (yazım farkıyla ${simFuzzy}) · yeni eklenen ${simAdded} · kulübü güncellenen ${simNewClub}`);

/* ───────── 2b) lig üyeliği sezon sezon: oyuncu oradayken kulüp o ligde miydi?
   Eski yöntem "kulüp o ligde hiç oynamış mı" idi: Premier Lig kurulmadan önce Liverpool'da oynayan ya da
   Bursaspor'un alt lig yıllarında oynayan da "o ligde oynadı" sayılıyordu. Katılımcılar: Wikidata P1923 ∪
   sezon maddesinin puan tablosu. Kulüp listesi olmayan sezonda eski kayıt korunur (çürütülemiyor). */

console.log('» lig sezonları');
const lgSpans = []; // lig → takım anahtarı → [[başlangıç, bitiş]]
const lgHoles = []; // lig → kulüp listesi eksik sezonlar
for (const [li, l] of LEAGUES.entries()) {
  const m = new Map();
  const holes = [];
  const lq = R.leagues[l[0]]?.qid;
  if (lq) {
    for (const s of await leagueSeasons(lq)) {
      if (!s.span) continue;
      if (s.clubs.size < 10) holes.push(s.span);
      for (const cq of s.clubs) push(m, tk(cq), s.span);
    }
  }
  lgSpans[li] = m;
  lgHoles[li] = holes;
  console.log(`  ${l[0]}: ${m.size} kulüp · kulüp listesi eksik sezon ${holes.length}`);
}
const overlap = (a, b, x, y) => Math.min(b, y) - Math.max(a, x);
let lgBefore = 0;
let lgAfter = 0;
for (const p of P) {
  const old = p.leagues;
  const next = new Set();
  for (const st of p.stints) {
    if (st.key.startsWith('n')) continue;
    for (let li = 0; li < LEAGUES.length; li++) {
      const spans = lgSpans[li].get(st.key);
      if (st.ps === null) {
        if (spans && old.has(li)) next.add(li); // tarihsiz dönem: doğrulanamıyor, eski kayıt kalır
        continue;
      }
      const pe = st.pe >= NOW - 0.01 ? NOW + 0.7 : st.pe; // hâlâ oradaysa bu sezonun sonuna kadar
      if (spans?.some(([x, y]) => overlap(st.ps, pe, x, y) >= 0.25)) next.add(li);
      else if (old.has(li) && lgHoles[li].some(([x, y]) => overlap(st.ps, pe, x, y) >= 0.25)) next.add(li);
    }
  }
  lgBefore += old.size;
  lgAfter += next.size;
  p.leagues = next;
}
console.log(`  lig üyeliği: ${lgBefore} → ${lgAfter}`);

const byTeam = new Map(); // takım anahtarı → [{p, st}]
for (const p of P) for (const st of p.stints) if (st.ps !== null) push(byTeam, st.key, { p, st });

// Ana kulüpteki dönem başka kulübe kiralık gidilen süreyi de kapsar (bilgi kutusu kiralığı ayrıca yazar):
// o sürede ana kulübün hocasıyla çalışmış ya da kupasını kazanmış sayılmasın.
const loansAway = (p, key) => p.stints.filter((s) => s.loan && s.key !== key && s.ps !== null);
function together(p, st, a, b) {
  const lo = Math.max(st.ps, a);
  const hi = Math.min(st.pe, b);
  if (hi <= lo) return 0;
  let t = hi - lo;
  for (const l of loansAway(p, st.key)) t -= Math.max(0, Math.min(hi, l.pe) - Math.max(lo, l.ps));
  return t;
}
const awayOnLoan = (p, st, D) => loansAway(p, st.key).some((l) => l.ps <= D && D <= l.pe);

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
    if (together(p, st, cs, ce) > 0.15) (under.get(m) || under.set(m, new Set()).get(m)).add(p);
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
        winners = (byTeam.get(wk) || []).filter(({ p, st }) => st.ps <= D && D <= st.pe && !awayOnLoan(p, st, D)).map(({ p }) => p);
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
      for (const p of winners) {
        p.cups.add(ci);
        (p.cupN ||= new Map()).set(ci, (p.cupN.get(ci) || 0) + 1); // "2+ ŞL", "3+ şampiyonluk" jokerleri için
      }
      won += winners.length;
    }
  }
  cupReport.push(`${key}:${seasonsUsed} sezon/${won}`);
}
console.log('  ' + cupReport.join(' · ') + ` · Wikipedia'dan tamamlanan kazanan: ${wikiFilled}`);

/* ───────── 5) jokerler */

const W = Object.fromEntries(WILDCARDS.map((w, i) => [w[0], i]));
const WC_I = COMPETITIONS.findIndex((c) => c[0] === 'wc');
const CUP_I = Object.fromEntries(COMPETITIONS.map((c, i) => [c[0], i]));
const LG_I = Object.fromEntries(LEAGUES.map((l, i) => [l[0], i]));
const CLUB_I = Object.fromEntries(CLUBS.map((c, i) => [c[0], i]));
const BIG5 = ['eng', 'esp', 'ita', 'ger', 'fra'];
for (const p of P) {
  const ex = (p.qid && extras.get(p.qid)) || [];
  if (ex.some((x) => x.k === 'a' && x.v === 'Q166177')) p.wild.add(W.ballon);
  if (ex.some((x) => x.k === 'e' && wcEditions.has(x.v)) || p.cups.has(WC_I)) p.wild.add(W.wcplay);
  if (p.by && p.by >= 2000) p.wild.add(W.y2000);
  if (p.by && p.by < 1980) p.wild.add(W.pre1980);
  if (new Set(p.stints.filter((st) => !st.key.startsWith('n')).map((st) => st.q || st.key)).size >= 8) p.wild.add(W.clubs8);
  if (p.qid && coachSet.has(p.qid)) p.wild.add(W.coach);

  const won = (k) => p.cupN?.get(CUP_I[k]) || 0;
  if (won('ucl') >= 2) p.wild.add(W.ucl2);
  for (const k of ['tr1', 'eng', 'esp', 'ita', 'ger']) if (won(k) >= 3) p.wild.add(W['lt3' + k]);
  if (BIG5.filter((k) => won(k) > 0).length >= 2) p.wild.add(W.lt2big);
  const big = BIG5.filter((k) => p.leagues.has(LG_I[k])).length;
  if (big >= 3) p.wild.add(W.big3);
  if (big >= 4) p.wild.add(W.big4);
  if (p.by >= 1970 && p.by <= 1979) p.wild.add(W.d70);
  if (p.by >= 1980 && p.by <= 1989) p.wild.add(W.d80);
  if (p.by >= 1990 && p.by <= 1999) p.wild.add(W.d90);
  // Treble: o sezonun sonunda kadroda olmak (başka kulüpte kiralıkken sayılmaz)
  const treble = TREBLES.some(([ck, y]) => {
    const key = 'c' + CLUB_I[ck];
    const D = y + 0.4;
    return p.stints.some((st) => st.key === key && st.ps !== null && st.ps <= D && D <= st.pe && !awayOnLoan(p, st, D));
  });
  if (treble) p.wild.add(W.treble);
  // Bilgi kutusundaki lig maçı / golü: tek kulüpte 300+ maç, kariyerde 100+ gol
  const ib = ibOf(p);
  if (ib) {
    const per = new Map();
    for (const [t, label, , , , caps] of ib.c) {
      if (!caps) continue;
      const k = (t && QOF.get(t)) || fold(label);
      per.set(k, (per.get(k) || 0) + caps);
    }
    if (per.size && Math.max(...per.values()) >= 300) p.wild.add(W.apps300);
    const goals = ib.tg ?? ib.c.reduce((s, r) => s + (r[6] || 0), 0);
    if (goals >= 100) p.wild.add(W.goals100);
  }
}

/* ───────── 5b) takım arkadaşları: yıldızla aynı kulüpte, aynı dönemde en az ~4 ay birlikte oynamak */

console.log('» takım arkadaşları');
const TURK_STARS = ['Hakan Şükür', 'Gheorghe Hagi', 'Alex de Souza', 'Arda Turan', 'Emre Belözoğlu', 'Rüştü Reçber',
  'Hakan Çalhanoğlu', 'Arda Güler', 'Burak Yılmaz', 'Fernando Muslera', 'Wesley Sneijder', 'Didier Drogba',
  'Mauro Icardi', 'Mesut Özil', 'Edin Džeko', 'Romelu Lukaku', 'Victor Osimhen', 'Ricardo Quaresma'];
const starPool = P.filter((p) => p.qid && p.stints.some((st) => st.ps !== null && st.pe > 1990 && !st.key.startsWith('n')));
const stars = [...new Set([...starPool.slice(0, 44), ...starPool.filter((p) => TURK_STARS.includes(p.name))])];
const mates = [];
for (const star of stars) {
  const set = new Set();
  for (const st of star.stints) {
    if (st.ps === null || st.key.startsWith('n')) continue;
    for (const { p, st: o } of byTeam.get(st.key) || []) {
      if (p !== star && o.ps !== null && Math.min(st.pe, o.pe) - Math.max(st.ps, o.ps) >= 0.3) set.add(p);
    }
  }
  const known = [...set].filter((p) => p.sl >= KNOWN_SL).length;
  if (known >= 12) mates.push({ key: star.qid, name: star.name, set, known, tier: star.sl >= 60 || TURK_STARS.includes(star.name) ? 'k' : 'u' });
}
mates.sort((a, b) => b.known - a.known);
mates.forEach((m, i) => m.set.forEach((p) => (p.mates ||= new Set()).add(i)));
console.log(`  ${mates.length} yıldız · ${mates.slice(0, 6).map((m) => `${m.name} (${m.known})`).join(' · ')}`);

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
  source: base.source + ' · teknik direktör P286, katılım P1344, ödül P166, sezon kazananı P1346 (+Wikipedia) · 2026-27 kadroları futbol-sim-2627 · A takım kariyeri, milli takım, doğum yılı, lig sezonları: İngilizce Wikipedia (CC BY-SA)',
  cups: COMPETITIONS.map((c) => ({ key: c[0], name: c[1], short: c[2], tier: c[5], desc: c[6], fail: c[7] })),
  managers: managers.map((m) => ({ key: m.key, name: m.name, tier: m.tier })),
  mates: mates.map((m) => ({ key: m.key, name: m.name, tier: m.tier })),
  wilds: WILDCARDS.map((w) => ({ key: w[0], name: w[1], desc: w[2], fail: w[3], tier: w[4] })),
  // 13. alan: katalog kulüplerindeki yıllar [kulüp, başlangıç|null, bitiş|0=hâlâ|null] · 14. alan: takım arkadaşı olunan yıldızlar
  players: P.map((p) => [
    p.name, p.by, p.sl, arr(p.clubs), arr(p.nats), arr(p.leagues), p.pos, p.aliases, p.qid,
    arr(p.cups), arr(p.mgrs), arr(p.wild), clubYears(p), arr(p.mates || new Set()),
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
const lgI = (k) => LEAGUES.findIndex((l) => l[0] === k);
show('PL öncesi Liverpool (boş olmalı)', (p) => ['Kenny Dalglish', 'Kevin Keegan', 'Graeme Souness', 'Alan Hansen'].includes(p.name) && p.leagues.has(lgI('eng')));
const famousDrops = wpDropped.filter(([p]) => p.sl >= 30).sort((a, b) => b[0].sl - a[0].sl);
console.log(`  bilgi kutusuna göre silinen katalog kulübü: ${wpDropped.length} (sitelink ≥30: ${famousDrops.length})`);
console.log('    ' + famousDrops.slice(0, 30).map(([p, c]) => `${p.name} → ${base.clubs[c].name}`).join(' · '));
show('Arda Güler × Mourinho?', (p) => p.name === 'Arda Güler' && p.mgrs.has(mgrI('Mourinho')));
console.log('  menajerler (tanınmış oyuncu):', managers.slice(0, 30).map((m) => `${m.name}${m.tier === 'k' ? '' : '°'} ${m.known}`).join(' · '));
