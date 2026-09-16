/* İngilizce Wikipedia yardımcıları (önbellekli, tools/.cache):
   · futbolcu bilgi kutusu → A takım kariyeri (kulüp, yıllar, kiralık, lig maçı/gol), altyapı kulüpleri, milli takımlar
   · sayfa başlığı → Wikidata QID
   · lig sezonu katılımcıları: Wikidata P1923 + sezon maddesinin puan tablosu (Module:Sports table, name_XXX) */

import { getJSON, cached, sparql, values, chunk, pool, Q } from './wd.mjs';

const API = 'https://en.wikipedia.org/w/api.php';

function wp(params) {
  return getJSON(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString(),
  });
}

export const normTitle = (t) => {
  const s = String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
};

/** normalized + redirects zinciri: istenen başlık → gerçek sayfa başlığı */
function resolver(q) {
  const norm = new Map((q.normalized || []).map((x) => [x.from, x.to]));
  const redir = new Map((q.redirects || []).map((x) => [x.from, x.to]));
  return (t) => {
    let x = norm.get(t) || t;
    for (let i = 0; i < 3 && redir.has(x); i++) x = redir.get(x);
    return x;
  };
}

const stripRefs = (s) =>
  String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '');

const clean = (v) =>
  stripRefs(v)
    .replace(/\{\{\s*(?:nowrap|nobr|small)\s*\|([^{}]*)\}\}/gi, '$1')
    .replace(/\{\{\s*0\s*\}\}/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .trim();

function firstLink(s) {
  const m = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/.exec(s);
  return m ? { t: normTitle(m[1]), label: (m[2] || m[1]).trim() } : null;
}

/** "120" · "(35)" · "{{0}}12" → sayı; boş ya da "?" → null */
function num(v) {
  const m = /\d+/.exec(clean(v).replace(/[()]/g, ''));
  return m ? Number(m[0]) : null;
}

/** "2011–2016" → [2011, 2016] · "2023–" → [2023, null] (hâlâ orada) · "2015" → [2015, 2015] · "2011–12" → [2011, 2012] */
export function parseYears(v) {
  const s = clean(v);
  const m = /(\d{4})\s*(?:–|—|-|&ndash;)\s*(\d{4}|\d{2})?/.exec(s);
  if (m) {
    const a = Number(m[1]);
    if (!m[2]) return [a, null];
    let b = Number(m[2]);
    if (m[2].length === 2) b = Math.floor(a / 100) * 100 + b + (b < a % 100 ? 100 : 0);
    return [a, b];
  }
  const one = /(\d{4})/.exec(s);
  return one ? [Number(one[1]), Number(one[1])] : [null, null];
}

/** Bilgi kutusu satırının yılları → kesirli yıl aralığı (başlangıç yaz transferi, bitiş sezon sonu). */
export function span(a, b, now) {
  if (a === null) return null;
  if (b === null) return [a + 0.55, now];
  if (b === a) return [a + 0.05, a + 0.95];
  return [a + 0.55, b + 0.45];
}

/** {{Infobox football biography}} →
    { c: [[başlık|null, etiket, başlangıç, bitiş|null, kiralık, lig maçı, lig golü]], y: [altyapı], n: [[milli takım, başlangıç, bitiş]],
      cur, by (doğum yılı), tc/tg (toplam lig maçı/golü) }.
    Parametreler satır düzeninden bağımsız okunur (bazı maddelerde hepsi tek satırda). */
export function parseInfobox(wt) {
  const start = wt.search(/\{\{\s*Infobox\s+(?:football|soccer)\s+biography/i);
  if (start < 0) return null;
  let depth = 0;
  let end = wt.length;
  for (let i = start; i < wt.length - 1; i++) {
    const two = wt[i] + wt[i + 1];
    if (two === '{{') {
      depth++;
      i++;
    } else if (two === '}}') {
      depth--;
      i++;
      if (depth === 0) {
        end = i - 1;
        break;
      }
    }
  }
  const body = stripRefs(wt.slice(start + 2, end));
  const parts = [];
  let cur = '';
  let d = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body[i] + (body[i + 1] || '');
    if (two === '{{' || two === '[[') {
      d++;
      cur += two;
      i++;
    } else if ((two === '}}' || two === ']]') && d > 0) {
      d--;
      cur += two;
      i++;
    } else if (body[i] === '|' && d === 0) {
      parts.push(cur);
      cur = '';
    } else cur += body[i];
  }
  parts.push(cur);
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  const nums = (prefix) =>
    Object.keys(params)
      .map((k) => new RegExp('^' + prefix + '(\\d+)$').exec(k))
      .filter(Boolean)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);

  const c = [];
  for (const n of nums('clubs')) {
    const v = clean(params['clubs' + n]);
    if (!v) continue;
    const l = firstLink(v);
    const loan = /→|&rarr;|\(loan\)|\{\{\s*loan/i.test(v) ? 1 : 0;
    const [a, b] = parseYears(params['years' + n]);
    const label = l ? l.label : v.replace(/\[\[|\]\]|'''?|→|&rarr;|\(loan\)/gi, '').trim();
    c.push([l ? l.t : null, label, a, b, loan, num(params['caps' + n]), num(params['goals' + n])]);
  }
  const y = nums('youthclubs')
    .map((n) => firstLink(clean(params['youthclubs' + n]))?.t)
    .filter(Boolean);
  const nt = [];
  for (const n of nums('nationalteam')) {
    const l = firstLink(clean(params['nationalteam' + n]));
    if (!l) continue;
    const [a, b] = parseYears(params['nationalyears' + n]);
    nt.push([l.t, a, b, num(params['nationalcaps' + n]), num(params['nationalgoals' + n])]);
  }
  return {
    c, y, n: nt,
    cur: firstLink(clean(params.currentclub || ''))?.t || null,
    by: birthYear(params.birth_date),
    tc: num(params.totalcaps),
    tg: num(params.totalgoals),
  };
}

/** {{birth date and age|1983|9|26}} · "26 September 1983" → 1983 */
function birthYear(v) {
  const m = /\b(1[89]\d\d|20[01]\d)\b/.exec(clean(v));
  return m ? Number(m[1]) : null;
}

/** Wikidata QID → enwiki başlığı */
export async function enTitles(qids) {
  const out = new Map();
  await pool(chunk([...new Set(qids)].sort(), 500), 2, async (b) => {
    const rows = await sparql(
      `SELECT ?p ?t WHERE { VALUES ?p { ${values(b)} } ?a schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t . }`,
    );
    for (const r of rows) out.set(Q(r.p), r.t);
  });
  return out;
}

/** enwiki başlıkları → çözümlenmiş bilgi kutuları (50'lik partiler, yalnız giriş bölümü) */
export async function infoboxes(titles, { log } = {}) {
  const out = new Map();
  const batches = chunk([...new Set(titles)].sort(), 50);
  let done = 0;
  await pool(batches, 2, async (b) => {
    const res = await cached('wp-ib4:' + b.join('|'), async () => {
      const j = await wp({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', rvsection: '0', redirects: '1', titles: b.join('|') });
      if (!j?.query) return null;
      const r = resolver(j.query);
      const byTitle = new Map((j.query.pages || []).map((p) => [p.title, p]));
      return Object.fromEntries(
        b.map((t) => {
          const wt = byTitle.get(r(t))?.revisions?.[0]?.slots?.main?.content;
          return [t, wt ? parseInfobox(wt) : null];
        }),
      );
    });
    for (const [t, v] of Object.entries(res || {})) out.set(t, v);
    if (log && ++done % 100 === 0) log(`  bilgi kutusu ${done}/${batches.length}`);
  });
  return out;
}

/** enwiki başlıkları → Wikidata QID (yönlendirmeler izlenir). Partide yalnız dil-arası bağlantı
    ("De:…") varsa API `pages` döndürmez. */
export async function titleQids(titles, { log } = {}) {
  const out = new Map();
  const batches = chunk([...new Set(titles)].filter(Boolean).sort(), 50);
  let done = 0;
  await pool(batches, 2, async (b) => {
    const res = await cached('wp-qid1:' + b.join('|'), async () => {
      const j = await wp({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: b.join('|') });
      if (!j?.query) return null;
      const r = resolver(j.query);
      const byTitle = new Map((j.query.pages || []).map((p) => [p.title, p.pageprops?.wikibase_item || null]));
      return Object.fromEntries(b.map((t) => [t, byTitle.get(r(t)) ?? null]));
    });
    for (const [t, q] of Object.entries(res || {})) out.set(t, q);
    if (log && ++done % 100 === 0) log(`  başlık → QID ${done}/${batches.length}`);
  });
  return out;
}

function frac(iso) {
  const m = /^\+?(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 + (Number(m[3]) - 1) / 365 : null;
}

/** Sezonun zaman aralığı: başlıktaki "2015–16" önce (tarih kayıtları çoğu zaman yalnız yıl hassasiyetinde). */
function seasonSpan(s) {
  const src = s.t || s.lbl || '';
  const two = /(\d{4})\s*[–-]\s*(\d{2,4})\b/.exec(src);
  if (two) {
    const a = Number(two[1]);
    let b = Number(two[2]);
    if (two[2].length === 2) b = Math.floor(a / 100) * 100 + b + (b < a % 100 ? 100 : 0);
    if (b > a) return [a + 0.6, b + 0.4];
  }
  const st = frac(s.st);
  const en = frac(s.en);
  if (st !== null && en !== null && en > st) return [st, en];
  const one = /\b(\d{4})\b/.exec(src);
  if (one) return [Number(one[1]) + 0.1, Number(one[1]) + 0.9]; // takvim yılı sezonu (1959 Milli Lig, MLS)
  return st !== null ? [st, st + 0.8] : null;
}

/** Lig sezonları + katılımcı kulüpler (QID). Wikidata P1923 ∪ sezon maddesinin puan tablosu. */
export async function leagueSeasons(lq) {
  const rows = await sparql(
    `SELECT ?s ?t ?st ?en ?lbl WHERE { ?s wdt:P3450 wd:${lq} .
      OPTIONAL { ?a schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t . }
      OPTIONAL { ?s wdt:P580 ?st } OPTIONAL { ?s wdt:P582 ?en } OPTIONAL { ?s rdfs:label ?lbl FILTER(LANG(?lbl) = "en") } }`,
  );
  const part = await sparql(`SELECT ?s ?c WHERE { ?s wdt:P3450 wd:${lq} ; wdt:P1923 ?c . }`);
  const S = new Map();
  for (const r of rows) if (!S.has(r.s)) S.set(r.s, { q: Q(r.s), t: r.t || null, st: r.st || null, en: r.en || null, lbl: r.lbl || null, clubs: new Set(), wd: 0, wp: 0 });
  for (const r of part) {
    const s = S.get(r.s);
    if (s && !s.clubs.has(Q(r.c))) {
      s.clubs.add(Q(r.c));
      s.wd++;
    }
  }
  const withT = [...S.values()].filter((s) => s.t);
  const links = new Map();
  for (const b of chunk(withT.map((s) => s.t).sort(), 10)) {
    // Takım kodları Türkçe harf içerebilir (name_ÇYR, name_İBF, name_BEŞ) → kod için [^\s=|]
    const res = await cached('wp-season2:' + b.join('|'), async () => {
      const j = await wp({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: b.join('|') });
      if (!j?.query) return null;
      const r = resolver(j.query);
      const byTitle = new Map((j.query.pages || []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content || '']));
      return Object.fromEntries(
        b.map((t) => [t, [...new Set([...(byTitle.get(r(t)) || '').matchAll(/\|\s*name_[^\s=|]+\s*=[^\n]*?\[\[([^\]|#]+)/g)].map((m) => normTitle(m[1])))]]),
      );
    });
    for (const [t, v] of Object.entries(res || {})) links.set(t, v);
  }
  const qid = await titleQids([...links.values()].flat());
  for (const s of withT) {
    for (const t of links.get(s.t) || []) {
      const cq = qid.get(t);
      if (cq && !s.clubs.has(cq)) {
        s.clubs.add(cq);
        s.wp++;
      } else if (cq) s.wp++;
    }
  }
  return [...S.values()].map((s) => ({ q: s.q, title: s.t || s.lbl, span: seasonSpan(s), clubs: s.clubs, wd: s.wd, wp: s.wp }));
}
