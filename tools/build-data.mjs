/* FOOTBALLGRID veri derleyici — Wikidata'dan gerçek kariyer geçmişi.

   node tools/build-data.mjs --resolve   → katalogdaki adları Wikidata kimliklerine çevirir (resolved.json)
   node tools/build-data.mjs --build     → SPARQL ile oyuncuları çeker, server/data/db.json yazar

   Her SPARQL yanıtı tools/.cache/ altına yazılır; yeniden koşmak ağa gitmez.
   Önbelleği tazelemek için klasörü silmen yeter. */

import { CLUBS, NATIONS, LEAGUES, POSITIONS, UK, UK_BLOCKERS } from './catalog.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(HERE, '.cache');
const RESOLVED = join(HERE, 'resolved.json');
const OUT = join(ROOT, 'server', 'data', 'db.json');
const UA = 'FootballGrid-databuilder/1.0 (local hobby project)';
const MIN_SITELINKS = 1; // en az bir Wikipedia maddesi olan futbolcular
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = new Set(process.argv.slice(2));
const PARTIAL = args.has('--partial'); // yalnızca önbellekteki yanıtlarla derle (ağa gitme)
const MISSING = [];

async function getJSON(url, opts = {}, tries = 7) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) },
      });
      if (r.status === 429 || r.status >= 500) {
        const wait = Number(r.headers.get('retry-after')) || 2 ** i * 2;
        console.warn(`  HTTP ${r.status} → ${wait} sn bekleniyor`);
        await sleep(wait * 1000);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      console.warn('  hata, yeniden deneniyor:', String(e.message).slice(0, 160));
      await sleep(2500 * (i + 1));
    }
  }
  throw new Error(`${tries} denemede de yanıt alınamadı: ${url.slice(0, 80)}`);
}

async function sparql(query, label = '') {
  const key = createHash('sha1').update(query).digest('hex').slice(0, 20);
  const file = join(CACHE, key + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  if (PARTIAL) {
    MISSING.push(label);
    return [];
  }
  const t0 = Date.now();
  const j = await getJSON('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body: 'query=' + encodeURIComponent(query),
  });
  const rows = j.results.bindings.map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])),
  );
  writeFileSync(file, JSON.stringify(rows));
  if (label) console.log(`  ${label}: ${rows.length} satır, ${Date.now() - t0} ms`);
  await sleep(250);
  return rows;
}

const Q = (uri) => uri.slice(uri.lastIndexOf('/') + 1);

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/* ───────────────────────────── 1) ÇÖZÜMLEME ───────────────────────────── */

async function search(text) {
  const u =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=12' +
    '&language=en&uselang=en&search=' +
    encodeURIComponent(text);
  return (await getJSON(u)).search || [];
}

const CLUB_BAD =
  /women|female|ladies|national|reserve|youth|under-?\d|\bu-?\d\d\b|basketball|volleyball|futsal|handball|hockey|water polo|academy|season|stadium|supporters|disambiguation|wikimedia|B team|II\b/i;
const NT_BAD =
  /women|female|under|\bu-?\d\d\b|youth|olymp|futsal|beach|amateur|\bB\b|reserve|season|squad|record|results|list of|wikimedia|B team|legends|rugby|basketball|cricket|hockey/i;
const LEAGUE_BAD = /women|female|season|\b(19|20)\d\d\b|wikimedia|list of|youth|reserve|basketball|volleyball|handball|futsal/i;

function pick(results, good, bad, extra) {
  const ok = (r) =>
    good.test(r.description || '') &&
    !bad.test(r.description || '') &&
    !bad.test(r.label || '') &&
    (!extra || extra.test(r.description || ''));
  return results.find(ok);
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// İlk aramada yanlış kayda giden kulüpler için daha iyi arama metni + açıklama süzgeci.
const RESEARCH = {
  fb: ['Fenerbahçe'],
  goz: ['Göztepe'],
  kon: ['Konyaspor', /turk|konya/i],
  agu: ['Ankaragücü'],
  rcde: ['RCD Espanyol'],
  bvb: ['Borussia Dortmund'],
  hsv: ['Hamburger SV'],
  sge: ['Eintracht Frankfurt'],
  bsc: ['Hertha BSC'],
  scp: ['Sporting CP', /portug|lisbon/i],
  psv: ['PSV Eindhoven'],
  pao: ['Panathinaikos', /gree|athens/i],
  hil: ['Al Hilal', /saudi|riyadh/i],
  boca: ['Boca Juniors', /argentin|buenos/i],
  riv: ['River Plate', /argentin|buenos/i],
  fla: ['Flamengo', /brazil|rio/i],
  sfc: ['Santos FC', /brazil|paulo|santos/i],
  sccp: ['Corinthians', /brazil|paulo/i],
  sep: ['Palmeiras', /brazil|paulo/i],
};

/** Arama API'si yanıtları da önbelleğe yazılır (API sık 429 veriyor). */
async function searchCached(text) {
  const file = join(CACHE, 'search-' + createHash('sha1').update(text).digest('hex').slice(0, 16) + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const r = await search(text);
  writeFileSync(file, JSON.stringify(r));
  await sleep(500);
  return r;
}
const CAND_BAD =
  /women|female|ladies|national|reserve|youth|under-?\d|futsal|beach|basketball|volleyball|handball|hockey|water polo|B team|in European football|versus|season|academy/i;

/** WDQS içinden arama (mwapi → wbsearchentities). Arama API'sine doğrudan gitmediği için 429 yok. */
function mwapiSearch(text) {
  return `SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:api "EntitySearch" ; wikibase:endpoint "www.wikidata.org" ;
                      mwapi:search "${esc(text)}" ; mwapi:language "en" .
      ?item wikibase:apiOutputItem mwapi:item .
    }
    OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }
    OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }`;
}

// Milli takım etiketlerinin ülke adı farklı yazılabilen hâlleri
const NT_ALT = {
  tr: ['Turkey', 'Türkiye'],
  cz: ['Czech Republic', 'Czechia'],
  ie: ['Republic of Ireland'],
  ci: ['Ivory Coast', "Côte d'Ivoire"],
  cd: ['DR Congo', 'Democratic Republic of the Congo'],
  ca: ['Canada', 'Canadian'],
  kr: ['South Korea', 'Korea Republic'],
  us: ['United States', 'USA'],
};

async function resolve() {
  // Elle düzeltilmiş kayıtlar ("manual": true) korunur, gerisi baştan çözülür.
  const prev = existsSync(RESOLVED) ? JSON.parse(readFileSync(RESOLVED, 'utf8')) : {};
  const keep = (o = {}) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.manual));
  const res = { clubs: keep(prev.clubs), leagues: keep(prev.leagues), nt: keep(prev.nt), blockers: keep(prev.blockers) };
  const save = () => writeFileSync(RESOLVED, JSON.stringify(res, null, 2));

  // Aday listesi arama API'sinden (önbellekli), sayım tek bir hafif SPARQL ile:
  // ana kayıt en kalabalık olandır. Çok branşlı kulübün futbol şubesi ayrı kayıtsa
  // ikisi birleştirilir (extra).
  async function byCount(text, keepIt, countPattern) {
    const found = (await searchCached(text)).filter(keepIt);
    if (!found.length) return [];
    const rows = await sparql(
      `SELECT ?item (COUNT(DISTINCT ?x) AS ?n) WHERE { VALUES ?item { ${values(found.map((f) => f.id))} } ${countPattern} } GROUP BY ?item`,
      'sayım: ' + text,
    );
    const n = new Map(rows.map((r) => [Q(r.item), Number(r.n)]));
    return found
      .map((f) => ({ qid: f.id, label: f.label || '', desc: f.description || '', n: n.get(f.id) || 0 }))
      .sort((a, b) => b.n - a.n);
  }

  for (const c of CLUBS.filter((c) => !res.clubs[c[0]])) {
    const [text, re] = RESEARCH[c[0]] || [c[1], c[9]];
    const cands = await byCount(
      text,
      (x) =>
        !CAND_BAD.test(x.label || '') &&
        !CAND_BAD.test(x.description || '') &&
        !/\b(B|II|Castilla|Primavera)\b/.test(x.label || '') &&
        (!re || re.test(x.description || '')),
      '?x p:P54/ps:P54 ?item .',
    );
    const top = cands[0];
    if (!top?.n) {
      console.warn(`!! kulüp bulunamadı: ${c[0]} "${text}"`);
      continue;
    }
    const extra = cands
      .slice(1)
      .filter((x) => x.n >= top.n * 0.15 && /multi-?sport|sports? club|section|department/i.test(x.desc + ' ' + top.desc))
      .map((x) => x.qid);
    res.clubs[c[0]] = { qid: top.qid, label: top.label, desc: top.desc, n: top.n, extra, others: cands.slice(1, 4).map((x) => `${x.qid}:${x.n}`) };
    save();
  }

  for (const l of LEAGUES.filter((l) => !res.leagues[l[0]])) {
    const cands = await byCount(
      l[1],
      (x) => !LEAGUE_BAD.test(x.label || '') && !/hockey|women|basketball|rugby/i.test(x.description || '') && l[4].test(x.description || ''),
      '?x wdt:P118 ?item .',
    );
    if (cands[0]?.n) res.leagues[l[0]] = cands[0];
    else console.warn(`!! lig bulunamadı: ${l[0]}`);
    save();
  }

  // Milli takımlar: "X men's national football team" etiketleriyle birebir, en kalabalık olan.
  const want = [
    ...NATIONS.filter((n) => !res.nt[n[0]]).map((n) => ['nt', n[0], n[3]]),
    ...UK_BLOCKERS.filter((b) => !res.blockers[b[0]]).map((b) => ['blockers', b[0], b[1]]),
  ];
  // Milli takımlar: arama adayları (A2, askerî, genç, kadın, tarihî takımlar süzülür),
  // ardından futbolcu sayısı — A takımı her zaman en kalabalık olandır.
  const base = (s) => s.replace(/\s+(men's\s+)?national\s+(football|soccer)\s+team$/i, '');
  const NT_STRICT =
    /women|female|under|\bu-?\d\d\b|youth|olymp|futsal|beach|amateur|\bB\b|reserve|military|legends|students|universi|unofficial|\bA['′2]|category|season|squad|results|list of|record|matches|regional|east germany|west germany|saarland/i;
  for (const [kind, key, name] of want) {
    const names = NT_ALT[key] || [base(name)];
    const found = [];
    for (const nm of names) found.push(...(await searchCached(`${nm} national football team`)));
    const cands = [...new Map(found.map((f) => [f.id, f])).values()].filter((f) => {
      const l = f.label || '';
      // Süzgeç yalnızca etikette: A takımlarının açıklaması "West Germany", "matches" gibi
      // kelimeler içerebiliyor. Asıl ayırt edici olan futbolcu sayısı.
      return (
        /national (association )?(football|soccer) team/i.test(l) &&
        !NT_STRICT.test(l) &&
        !/women|female/i.test(f.description || '') &&
        names.some((nm) => l.toLowerCase().startsWith(nm.toLowerCase()))
      );
    });
    if (!cands.length) {
      console.warn(`!! milli takım adayı yok: ${key}`);
      continue;
    }
    const rows = await sparql(
      `SELECT ?item (COUNT(DISTINCT ?x) AS ?n) WHERE { VALUES ?item { ${values(cands.map((c) => c.id))} } ?x p:P54/ps:P54 ?item . } GROUP BY ?item`,
      'milli takım ' + key,
    );
    const n = new Map(rows.map((r) => [Q(r.item), Number(r.n)]));
    const ranked = cands.map((c) => ({ qid: c.id, label: c.label, desc: c.description || '', n: n.get(c.id) || 0 })).sort((a, b) => b.n - a.n);
    if (!ranked[0].n) {
      console.warn(`!! milli takım bulunamadı: ${key}`);
      continue;
    }
    res[kind][key] = { ...ranked[0], others: ranked.slice(1, 3).map((x) => `${x.qid}:${x.n}`) };
    save();
  }
  for (const kind of ['clubs', 'leagues', 'nt', 'blockers']) {
    console.log(`\n── ${kind}`);
    for (const [k, v] of Object.entries(res[kind])) {
      if (v.manual) continue;
      console.log(`${k.padEnd(6)} ${v.qid.padEnd(10)} ${v.label}  —  ${v.desc ?? ''}${v.n ? `  [${v.n}]` : ''}${v.extra?.length ? ` +${v.extra.join(',')}` : ''}${v.others ? `  (diğer: ${v.others.join(' ')})` : ''}`);
    }
  }
}

/* ───────────────────────────── 2) DERLEME ───────────────────────────── */

const values = (ids) => ids.map((id) => 'wd:' + id).join(' ');
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function build() {
  const R = JSON.parse(readFileSync(RESOLVED, 'utf8'));
  const missing = CLUBS.filter((c) => !R.clubs[c[0]]).map((c) => c[0]);
  if (missing.length) throw new Error('çözümlenmemiş kulüpler: ' + missing.join(', '));

  // Bir kulüp birden çok Wikidata kaydına dağılmış olabilir (futbol şubesi + çok branşlı kulüp).
  const qidsOf = (key) => [R.clubs[key].qid, ...(R.clubs[key].extra || [])];

  // 2a) kulüp kadroları (tüm zamanlar)
  console.log('» kulüp kadroları');
  const members = new Map(); // playerQ -> sitelinks
  const perClub = {};
  await pool(CLUBS, 3, async (c) => {
    const rows = await sparql(
      `SELECT DISTINCT ?p ?sl WHERE {
        VALUES ?club { ${values(qidsOf(c[0]))} }
        ?st ps:P54 ?club . ?p p:P54 ?st .
        ?p wdt:P106 wd:Q937857 ; wikibase:sitelinks ?sl .
      }`,
      c[0],
    );
    perClub[c[0]] = rows.length;
    for (const r of rows) {
      const sl = Number(r.sl);
      if (sl >= MIN_SITELINKS) members.set(Q(r.p), sl);
    }
  });
  // Sıra sabit: partilerin bileşimi (dolayısıyla önbellek anahtarları) koşudan koşuya aynı kalsın.
  const players = [...members.keys()].sort();
  console.log(`  toplam benzersiz futbolcu (sitelink ≥ ${MIN_SITELINKS}): ${players.length}`);

  // 2b) lig → kulüpler (güncel lig üyeliği + sezon katılımcıları)
  console.log('» lig kulüpleri');
  const leagueClubs = new Map(); // clubQ -> Set(leagueIdx)
  await pool(LEAGUES, 2, async (l, li) => {
    const lq = R.leagues[l[0]]?.qid;
    if (!lq) return;
    const rows = await sparql(
      `SELECT DISTINCT ?c WHERE {
        { ?c wdt:P118 wd:${lq} . } UNION { ?s wdt:P3450 wd:${lq} ; wdt:P1923 ?c . }
      }`,
      'lig ' + l[0],
    );
    for (const r of rows) {
      const c = Q(r.c);
      if (!leagueClubs.has(c)) leagueClubs.set(c, new Set());
      leagueClubs.get(c).add(li);
    }
  });
  // katalogdaki kulüpler kendi liglerinde kesin sayılsın
  CLUBS.forEach((c) => {
    const li = LEAGUES.findIndex((l) => l[0] === c[7]);
    if (li < 0) return;
    for (const q of qidsOf(c[0])) {
      if (!leagueClubs.has(q)) leagueClubs.set(q, new Set());
      leagueClubs.get(q).add(li);
    }
  });

  // 2c) futbolcu ayrıntıları, 600'lük partiler
  const batches = chunk(players, 600);
  const clubsOf = new Map();
  const natsOf = new Map();
  const posOf = new Map();
  const meta = new Map();
  const aliasOf = new Map();
  const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);

  // --partial: parti bileşimi kulüp sorgularının bitiş sırasına bağlı ve koşudan koşuya değişiyor,
  // anahtarla eşleşmez. Bunun yerine önbellekteki bütün parti yanıtlarını satır biçimine göre topla.
  async function loadCachedDetails() {
    const { readdirSync } = await import('node:fs');
    const langs = ['tr', 'en', 'mul', 'pt', 'es', 'it', 'de', 'fr'];
    let n = 0;
    for (const f of readdirSync(CACHE)) {
      if (f.startsWith('search-') || !f.endsWith('.json')) continue;
      let rows;
      try {
        rows = JSON.parse(readFileSync(join(CACHE, f), 'utf8'));
      } catch {
        continue;
      }
      if (!Array.isArray(rows) || !rows.length || !rows[0].p) continue;
      const k = Object.keys(rows[0]).sort().join(',');
      if (k === 'c,p') for (const r of rows) push(clubsOf, Q(r.p), Q(r.c));
      else if (k === 'n,p') for (const r of rows) push(natsOf, Q(r.p), Q(r.n));
      else if (k === 'p,x') for (const r of rows) push(posOf, Q(r.p), Q(r.x));
      else if (k === 'a,p') for (const r of rows) push(aliasOf, Q(r.p), r.a);
      else if (rows.some((r) => Object.keys(r).some((x) => x.startsWith('l_')))) {
        for (const r of rows) {
          const p = Q(r.p);
          if (meta.get(p)?.name) continue;
          meta.set(p, {
            sl: Number(r.sl),
            by: r.bd ? parseInt(r.bd.replace(/^\+/, '').slice(0, 4), 10) || null : null,
            name: langs.map((l) => r['l_' + l]).find(Boolean) || null,
          });
        }
      } else continue;
      n++;
    }
    console.log(`  KISMİ: önbellekten ${n} parti yanıtı toplandı`);
  }

  console.log(`» ${batches.length} parti ayrıntı`);
  if (PARTIAL) await loadCachedDetails();
  else await pool(batches, 3, async (b, bi) => {
    const V = values(b);
    const tag = `parti ${bi + 1}/${batches.length}`;
    for (const r of await sparql(`SELECT ?p ?c WHERE { VALUES ?p { ${V} } ?p p:P54/ps:P54 ?c . }`, tag + ' kulüp'))
      push(clubsOf, Q(r.p), Q(r.c));
    for (const r of await sparql(
      `SELECT ?p ?n WHERE { VALUES ?p { ${V} } { ?p p:P27/ps:P27 ?n } UNION { ?p p:P1532/ps:P1532 ?n } }`,
      tag + ' uyruk',
    ))
      push(natsOf, Q(r.p), Q(r.n));
    for (const r of await sparql(`SELECT ?p ?x WHERE { VALUES ?p { ${V} } ?p p:P413/ps:P413 ?x . }`, tag + ' mevki'))
      push(posOf, Q(r.p), Q(r.x));
    const langs = ['tr', 'en', 'mul', 'pt', 'es', 'it', 'de', 'fr'];
    for (const r of await sparql(
      `SELECT ?p ?sl ?bd ${langs.map((l) => '?l_' + l).join(' ')} WHERE { VALUES ?p { ${V} }
        ?p wikibase:sitelinks ?sl .
        OPTIONAL { ?p wdt:P569 ?bd }
        ${langs.map((l) => `OPTIONAL { ?p rdfs:label ?l_${l} FILTER(LANG(?l_${l}) = "${l}") }`).join('\n')}
      }`,
      tag + ' künye',
    )) {
      const p = Q(r.p);
      if (meta.has(p)) continue; // birden çok doğum tarihi → ilkini al
      meta.set(p, {
        sl: Number(r.sl),
        by: r.bd ? parseInt(r.bd.replace(/^\+/, '').slice(0, 4), 10) || null : null,
        name: langs.map((l) => r['l_' + l]).find(Boolean) || null,
      });
    }
    const famous = b.filter((p) => members.get(p) >= 8);
    if (famous.length) {
      for (const r of await sparql(
        `SELECT ?p ?a WHERE { VALUES ?p { ${values(famous)} } ?p skos:altLabel ?a . FILTER(LANG(?a) = "en" || LANG(?a) = "tr" || LANG(?a) = "mul") }`,
        tag + ' takma ad',
      ))
        push(aliasOf, Q(r.p), r.a);
    }
  });

  // --partial: önbelleği eksik partilerin futbolcuları tamamen dışarıda kalır
  const skipBatch = new Set(
    MISSING.map((l) => l.split(' '))
      .filter((w) => w[0] === 'parti' && ['kulüp', 'uyruk', 'mevki', 'künye'].includes(w[2]))
      .map((w) => Number(w[1].split('/')[0]) - 1),
  );
  const skip = new Set([...skipBatch].flatMap((i) => batches[i]));
  if (PARTIAL) console.log(`  KISMİ derleme: ${skipBatch.size}/${batches.length} parti atlandı (${skip.size} futbolcu)`);

  // 2d) mevki etiketleri → 4 gruba
  const posIds = [...new Set([...posOf.values()].flat())];
  const posLabel = new Map();
  for (const c of chunk(posIds, 400)) {
    for (const r of await sparql(
      `SELECT ?x ?l WHERE { VALUES ?x { ${values(c)} } ?x rdfs:label ?l . FILTER(LANG(?l) = "en") }`,
      'mevki adları',
    ))
      posLabel.set(Q(r.x), r.l);
  }
  const posMaskOf = (ids) => {
    let m = 0;
    for (const id of ids || []) {
      const lbl = posLabel.get(id) || '';
      POSITIONS.forEach((p, i) => {
        if (p[2].test(lbl)) m |= 1 << i;
      });
    }
    return m;
  };

  // 2e) eşleme tabloları
  const clubIdx = new Map(CLUBS.flatMap((c, i) => qidsOf(c[0]).map((q) => [q, i])));
  const countryIdx = new Map();
  NATIONS.forEach((n, i) => n[2].forEach((q) => countryIdx.set(q, i)));
  const ntIdx = new Map();
  NATIONS.forEach((n, i) => R.nt[n[0]] && ntIdx.set(R.nt[n[0]].qid, i));
  const EN = NATIONS.findIndex((n) => n[0] === 'en');
  const homeNations = new Set(['en', 'sc', 'wa'].map((k) => NATIONS.findIndex((n) => n[0] === k)));
  const blockers = new Set(Object.values(R.blockers || {}).map((b) => b.qid));

  const out = [];
  let noName = 0;
  for (const p of players) {
    if (skip.has(p)) continue;
    const m = meta.get(p);
    if (!m || !m.name) {
      noName++;
      continue;
    }
    const cl = clubsOf.get(p) || [];
    const clubs = [...new Set(cl.map((c) => clubIdx.get(c)).filter((x) => x !== undefined))].sort((a, b) => a - b);
    if (!clubs.length) continue;
    const nats = new Set();
    for (const n of natsOf.get(p) || []) if (countryIdx.has(n)) nats.add(countryIdx.get(n));
    for (const c of cl) if (ntIdx.has(c)) nats.add(ntIdx.get(c));
    const ukCitizen = (natsOf.get(p) || []).includes(UK);
    const hasHome = [...nats].some((i) => homeNations.has(i));
    if (ukCitizen && !hasHome && !cl.some((c) => blockers.has(c))) nats.add(EN);
    const leagues = new Set();
    for (const c of cl) for (const li of leagueClubs.get(c) || []) leagues.add(li);
    const name = m.name.replace(/\s*\(.*?\)\s*$/, '').trim();
    const aliases = [...new Set(aliasOf.get(p) || [])]
      .filter((a) => a !== name && a.length >= 3 && a.length <= 32 && !/[()]/.test(a))
      .sort((a, b) => a.length - b.length)
      .slice(0, 4);
    out.push([
      name,
      m.by,
      m.sl,
      clubs,
      [...nats].sort((a, b) => a - b),
      [...leagues].sort((a, b) => a - b),
      posMaskOf(posOf.get(p)),
      aliases,
      p,
    ]);
  }
  out.sort((a, b) => b[2] - a[2]);

  const db = {
    version: 1,
    builtAt: new Date().toISOString(),
    source: 'Wikidata (CC0) — kulüp üyeliği P54, uyruk P27/P1532, mevki P413',
    clubs: CLUBS.map((c) => ({
      key: c[0],
      qid: R.clubs[c[0]].qid,
      name: c[2],
      short: c[3],
      colors: [c[4], c[5]],
      nation: c[6],
      league: c[7],
      tier: c[8],
    })),
    nations: NATIONS.map((n) => ({ key: n[0], name: n[1], flag: n[4], tier: n[5] })),
    leagues: LEAGUES.map((l) => ({ key: l[0], qid: R.leagues[l[0]]?.qid || null, name: l[2], short: l[3] })),
    positions: POSITIONS.map((p) => ({ key: p[0], name: p[1] })),
    players: out,
  };
  writeFileSync(OUT, JSON.stringify(db));
  const kb = Math.round(JSON.stringify(db).length / 1024);
  console.log(`\n✔ ${out.length} futbolcu yazıldı → ${OUT} (${kb} KB); adı olmayan: ${noName}`);

  // 2f) akıl sağlığı raporu
  const known = out.filter((x) => x[2] >= 15);
  console.log(`  tanınmış (sitelink ≥ 15): ${known.length}`);
  const ci = (k) => CLUBS.findIndex((c) => c[0] === k);
  const ni = (k) => NATIONS.findIndex((n) => n[0] === k);
  const both = (a, b, test) => out.filter((x) => test(x, a, b)).slice(0, 8).map((x) => x[0]).join(', ');
  const cc = (x, a, b) => x[3].includes(ci(a)) && x[3].includes(ci(b));
  const cn = (x, a, b) => x[3].includes(ci(a)) && x[4].includes(ni(b));
  console.log('  GS × FB   :', both('gs', 'fb', cc));
  console.log('  GS × RMA  :', both('gs', 'rma', cc));
  console.log('  FB × BRA  :', both('fb', 'br', cn));
  console.log('  JUV × ARG :', both('juv', 'ar', cn));
  console.log('  MUN × ENG :', both('mun', 'en', cn));
  console.log('  BAR × ARS :', both('bar', 'ars', cc));
  const posCount = POSITIONS.map((p, i) => `${p[0]}:${out.filter((x) => x[6] & (1 << i)).length}`).join(' ');
  console.log('  mevki     :', posCount, '· mevkisiz:', out.filter((x) => !x[6]).length);
  console.log('  lig       :', LEAGUES.map((l, i) => `${l[0]}:${out.filter((x) => x[5].includes(i)).length}`).join(' '));
  console.log('  kulüp başı:', Object.entries(perClub).map(([k, v]) => `${k}:${v}`).join(' '));
}

if (args.has('--resolve')) await resolve();
else if (args.has('--build')) await build();
else console.log('kullanım: node tools/build-data.mjs --resolve | --build');
