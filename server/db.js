/* Futbolcu veritabanı: kategoriler, bit kümeleri (hücre başına cevap sayımı), isim araması ve oyuncu kartı.
   Kategori türleri: club · nat (uyruk) · lg (lig) · pos (mevki) · cup (kupa) · mgr (menajer) · mate (takım arkadaşı) · wild (joker) */

import { readFileSync } from 'node:fs';
import { fold, locative } from './text.js';

// Otomatik ek kuralının okunuşla tutmadığı kulüpler.
const LOC_OVERRIDE = {
  mun: "Manchester United'da",
  new: "Newcastle'da",
  lei: "Leicester'da",
  lee: "Leeds United'da",
  fcgb: "Bordeaux'da",
  srfc: "Rennes'de",
  ogcn: "Nice'te",
  cel: "Celtic'te",
  ran: "Rangers'ta",
  lag: "LA Galaxy'de",
  riv: "River Plate'te",
  gb: "Gençlerbirliği'nde",
  agu: "Ankaragücü'nde",
};

// Başlık iki satır: [kalın ad, ne istendiğini söyleyen fiil] — "Şampiyonlar Ligi / kazandı"
const CUP_HEAD = {
  ucl: ['Şampiyonlar Ligi', 'kazandı'],
  uel: ['UEFA Kupası / Avrupa Ligi', 'kazandı'],
  wc: ['Dünya Kupası', 'kazandı'],
  euro: ['EURO', 'kazandı'],
  tr1: ['Süper Lig', 'şampiyonu oldu'],
  eng: ['Premier Lig', 'şampiyonu oldu'],
  esp: ['La Liga', 'şampiyonu oldu'],
  ita: ['Serie A', 'şampiyonu oldu'],
  ger: ['Bundesliga', 'şampiyonu oldu'],
  fra: ['Ligue 1', 'şampiyonu oldu'],
};
const WILD_HEAD = {
  ballon: ["Ballon d'Or", 'kazandı'],
  wcplay: ["Dünya Kupası'nda", 'oynadı'],
  y2000: ['2000 ve sonrası', 'doğumlu'],
  pre1980: ['1980 öncesi', 'doğumlu'],
  clubs8: ['8+ takımda', 'oynadı'],
  coach: ['Teknik direktör', 'oldu'],
  ucl2: ['2+ Şampiyonlar Ligi', 'kazandı'],
  lt2big: ["5 büyük ligin 2+'sinde", 'şampiyon oldu'],
  big3: ["5 büyük ligin 3+'ünde", 'oynadı'],
  big4: ["5 büyük ligin 4+'ünde", 'oynadı'],
  lt3tr1: ['3+ kez Süper Lig', 'şampiyonu oldu'],
  lt3eng: ['3+ kez Premier Lig', 'şampiyonu oldu'],
  lt3esp: ['3+ kez La Liga', 'şampiyonu oldu'],
  lt3ita: ['3+ kez Serie A', 'şampiyonu oldu'],
  lt3ger: ['3+ kez Bundesliga', 'şampiyonu oldu'],
  d70: ["1970'lerde", 'doğdu'],
  d80: ["1980'lerde", 'doğdu'],
  d90: ["1990'larda", 'doğdu'],
  treble: ['Treble', 'kazandı'],
  apps300: ['Tek kulüpte 300+', 'lig maçı oynadı'],
  goals100: ['100+ lig golü', 'attı'],
  ucl3: ['3+ Şampiyonlar Ligi', 'kazandı'],
  uclfinal: ['Şampiyonlar Ligi finali', 'oynadı'],
  ucl2clubs: ['2 farklı takımla', 'ŞL kazandı'],
  nt100: ['Milli takımda 100+', 'maç oynadı'],
  nt30g: ['Milli takımda 30+', 'gol attı'],
  apps500: ['Tek kulüpte 500+', 'lig maçı oynadı'],
  oneclub: ['Kariyeri tek kulüpte', 'geçti'],
  age35: ['35 yaşından sonra', 'oynadı'],
  active: ['Hâlâ', 'oynuyor'],
  topscorer: ['Bir ligde', 'gol kralı oldu'],
};

// Klasik modda da görünen büyük ligler (diğerleri yalnızca Uzman)
const BIG_LEAGUES = new Set(['tr1', 'eng', 'esp', 'ita', 'ger', 'fra']);

// Wikidata'da futbolcu + kulüp üyesi diye işaretlenmiş ama futbolcu olmayan kayıtlar.
const DENY = new Set([
  'Q169963', // Jason Statham (aktör) — "Manchester United × İngiltere" cevabı olarak çıkıyordu
]);

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

export class FootballDB {
  constructor(file) {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    this.builtAt = raw.enrichedAt || raw.builtAt;
    this.source = raw.source;
    this.players = raw.players
      .filter((p) => !DENY.has(p[8]))
      .map(([name, by, sl, clubs, nats, leagues, pos, aliases, qid, cups, mgrs, wild, st, mates], i) => ({
        i, name, by, sl, clubs, nats, leagues, pos, qid,
        aliases: aliases || [], cups: cups || [], mgrs: mgrs || [], wild: wild || [], st: st || null, mates: mates || [],
      }));
    // dosyada sitelink sayısına göre azalan sıralı → düşük indeks = daha tanınmış

    const wilds = raw.wilds || [];
    this.cats = [
      ...raw.clubs.map((c, idx) => ({
        key: 'club:' + c.key, type: 'club', idx, name: c.name, short: c.short, colors: c.colors,
        tier: c.tier, nation: c.nation, league: c.league, clubKey: c.key,
        loc: LOC_OVERRIDE[c.key] || locative(c.name),
      })),
      ...raw.nations.map((n, idx) => ({ key: 'nat:' + n.key, type: 'nat', idx, name: n.name, flag: n.flag, tier: n.tier, natKey: n.key })),
      ...raw.leagues.map((l, idx) => ({
        key: 'lg:' + l.key, type: 'lg', idx, name: l.name, short: l.short, tier: BIG_LEAGUES.has(l.key) ? 'k' : 'u', lgKey: l.key, loc: locative(l.name),
      })),
      ...raw.positions.map((p, idx) => ({ key: 'pos:' + p.key, type: 'pos', idx, name: p.name, tier: 'u' })),
      ...(raw.cups || []).map((c, idx) => ({ key: 'cup:' + c.key, type: 'cup', idx, name: c.name, short: c.short, tier: c.tier, desc: c.desc, fail: c.fail, cupKey: c.key })),
      ...(raw.managers || []).map((m, idx) => ({
        key: 'mgr:' + m.key, type: 'mgr', idx, name: m.name, tier: m.tier, desc: `${m.name} ile çalışmış`, fail: `${m.name} ile çalışmadı`,
      })),
      ...(raw.mates || []).map((m, idx) => ({
        key: 'mate:' + m.key, type: 'mate', idx, name: m.name, tier: m.tier,
        desc: `${m.name} ile aynı takımda oynamış`, fail: `${m.name} ile aynı takımda oynamadı`,
      })),
      ...wilds.map((w, idx) => ({ key: 'wild:' + w.key, type: 'wild', idx, name: w.name, tier: w.tier, desc: w.desc, fail: w.fail, wildKey: w.key })),
      ...this.turkishWilds(raw, wilds.length),
    ];
    this.catByKey = new Map(this.cats.map((c) => [c.key, c]));
    this.byType = {};
    for (const c of this.cats) (this.byType[c.type] ||= [])[c.idx] = c;

    const N = this.players.length;
    this.words = Math.ceil(N / 32);
    this.pairs = new Map(); // çift sayımı önbelleği — ızgara üretici aynı çiftleri defalarca sorar
    for (const cat of this.cats) {
      const bits = new Uint32Array(this.words);
      for (const p of this.players) if (this.matches(p, cat)) bits[p.i >>> 5] |= 1 << (p.i & 31);
      cat.bits = bits;
      cat.size = this.count(cat, cat, N);
    }
    this.buildSearch();
  }

  /** Derbi ve Türkiye jokerleri: mevcut kulüp/uyruk/lig verisinden hesaplanır. */
  turkishWilds(raw, start) {
    const clubIdx = (k) => raw.clubs.findIndex((c) => c.key === k);
    const big3 = ['gs', 'fb', 'bjk'].map(clubIdx).filter((i) => i >= 0);
    const trClubs = new Set(raw.clubs.map((c, i) => (c.nation === 'tr' ? i : -1)).filter((i) => i >= 0));
    const trNat = raw.nations.findIndex((n) => n.key === 'tr');
    const trLg = raw.leagues.findIndex((l) => l.key === 'tr1');
    const defs = [
      {
        key: 'derby', head: ['GS · FB · BJK', 'en az ikisinde oynadı'],
        desc: "İstanbul'un 3 büyüğünden en az ikisinde oynamış", fail: 'üç büyükten en az ikisinde oynamadı',
        test: (p) => big3.filter((i) => p.clubs.includes(i)).length >= 2,
      },
      {
        key: 'trforeign', head: ["Süper Lig'de oynamış", 'yabancı'],
        desc: "Süper Lig'de oynamış yabancı futbolcu", fail: "Süper Lig'de oynamış bir yabancı değil",
        test: (p) => p.leagues.includes(trLg) && !p.nats.includes(trNat),
      },
      {
        key: 'trabroad', head: ['Yurt dışında oynamış', 'Türk'],
        desc: 'Yurt dışı kulübünde oynamış Türk futbolcu', fail: 'yurt dışında oynamış bir Türk değil',
        test: (p) => p.nats.includes(trNat) && p.clubs.some((i) => !trClubs.has(i)),
      },
    ];
    return defs.map((d, k) => ({ ...d, key: 'wild:' + d.key, wildKey: d.key, type: 'wild', idx: start + k, name: d.head.join(' '), tier: 'k' }));
  }

  matches(p, cat) {
    switch (cat.type) {
      case 'club': return p.clubs.includes(cat.idx);
      case 'nat': return p.nats.includes(cat.idx);
      case 'lg': return p.leagues.includes(cat.idx);
      case 'pos': return ((p.pos >> cat.idx) & 1) === 1;
      case 'cup': return p.cups.includes(cat.idx);
      case 'mgr': return p.mgrs.includes(cat.idx);
      case 'mate': return p.mates.includes(cat.idx);
      case 'wild': return cat.test ? cat.test(p) : p.wild.includes(cat.idx);
      default: return false;
    }
  }

  /** İlk `limit` futbolcu (en tanınmışlar) içinde iki kategoriye birden uyanların sayısı. */
  count(a, b, limit = this.players.length) {
    const key = a.key < b.key ? `${a.key}|${b.key}|${limit}` : `${b.key}|${a.key}|${limit}`;
    const hit = this.pairs.get(key);
    if (hit !== undefined) return hit;
    const full = limit >>> 5;
    let n = 0;
    for (let w = 0; w < full; w++) n += popcount(a.bits[w] & b.bits[w]);
    const rest = limit & 31;
    if (rest) n += popcount(a.bits[full] & b.bits[full] & ((1 << rest) - 1));
    this.pairs.set(key, n);
    return n;
  }

  /** sitelink ≥ minSl olan futbolcuların indeks sınırı (dizi azalan sıralı). */
  knownLimit(minSl) {
    let lo = 0;
    let hi = this.players.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.players[mid].sl >= minSl) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** İki kategoriye uyan futbolcular, tanınmışlıktan aşağı. */
  answers(a, b, max = 5, exclude = null) {
    const out = [];
    for (let w = 0; w < this.words && out.length < max; w++) {
      let x = a.bits[w] & b.bits[w];
      while (x && out.length < max) {
        const bit = 31 - Math.clz32(x & -x);
        x &= x - 1;
        const i = (w << 5) + bit;
        if (!exclude || !exclude.has(i)) out.push(this.players[i]);
      }
    }
    return out;
  }

  natNames(p) {
    return p.nats.map((i) => this.byType.nat[i]?.name).filter(Boolean);
  }

  /** Yanlış cevapta hangi şartın tutmadığını anlatan cümle parçası. */
  failText(cat) {
    if (cat.fail) return cat.fail;
    switch (cat.type) {
      case 'club': return `${cat.loc} oynamadı`;
      case 'lg': return `${cat.loc} oynamadı`;
      case 'nat': return `${cat.name} uyruklu değil`;
      case 'pos': return `${cat.name.toLocaleLowerCase('tr')} değil`;
      default: return 'şart tutmuyor';
    }
  }

  /** Izgara başlığı: [kalın ad, fiil]. Kulüpte fiil yok (kulüpte oynamak zaten açık). */
  headOf(cat) {
    if (cat.head) return cat.head;
    switch (cat.type) {
      case 'nat': return [cat.name, 'uyruklu'];
      case 'lg': return [cat.loc, 'oynadı'];
      case 'cup': return CUP_HEAD[cat.cupKey] || [cat.name, 'kazandı'];
      case 'mgr': return [cat.name, 'ile çalıştı'];
      case 'mate': return [cat.name, 'ile oynadı'];
      case 'wild': return WILD_HEAD[cat.wildKey] || [cat.name, ''];
      default: return [cat.name, ''];
    }
  }

  /** İstemciye giden başlık bilgisi. */
  publicCat(cat) {
    const desc =
      cat.desc ||
      (cat.type === 'club' || cat.type === 'lg' ? `${cat.loc} oynamış` : cat.type === 'nat' ? `${cat.name} uyruklu` : `Mevki: ${cat.name}`);
    const o = { key: cat.key, type: cat.type, name: cat.name, desc, head: this.headOf(cat) };
    if (cat.short) o.short = cat.short;
    if (cat.colors) o.colors = cat.colors;
    if (cat.flag) o.flag = cat.flag;
    return o;
  }

  /** Oyuncu kartı: kulüpleri (yıllarıyla), uyruk, mevki, kupalar, hocalar, takım arkadaşları, özellikler. */
  card(fid) {
    const p = this.players[fid];
    if (!p) return null;
    const T = this.byType;
    const label = (c) => this.headOf(c).filter(Boolean).join(' ');
    const years = p.st && p.st.length ? p.st : p.clubs.map((ci) => [ci, null, null]);
    return {
      id: p.i,
      name: p.name,
      by: p.by,
      qid: p.qid,
      nats: p.nats.map((i) => T.nat[i]).filter(Boolean).map((c) => ({ name: c.name, flag: c.flag })),
      pos: (T.pos || []).filter((c) => c && this.matches(p, c)).map((c) => c.name),
      clubs: years
        .map(([ci, from, to]) => {
          const c = T.club[ci];
          return c && { name: c.name, short: c.short, colors: c.colors, from, to };
        })
        .filter(Boolean),
      leagues: p.leagues.map((i) => T.lg[i]?.name).filter(Boolean),
      cups: p.cups.map((i) => T.cup?.[i]).filter(Boolean).map(label),
      mgrs: p.mgrs.map((i) => T.mgr?.[i]?.name).filter(Boolean),
      mates: p.mates.map((i) => T.mate?.[i]?.name).filter(Boolean),
      wild: (T.wild || []).filter((c) => c && this.matches(p, c)).map(label),
    };
  }

  buildSearch() {
    this.variants = []; // [{i, text, toks, alias}]
    this.buckets = new Map(); // ilk iki harf → varyant indeksleri (tanınmışlık sırasıyla)
    for (const p of this.players) {
      for (const [text, alias] of [[p.name, false], ...p.aliases.map((a) => [a, true])]) {
        const toks = tokens(text);
        if (!toks.length) continue;
        const v = this.variants.length;
        this.variants.push({ i: p.i, text, toks, full: toks.join(' '), alias });
        for (const k of new Set(toks.map((t) => t.slice(0, 2)))) {
          (this.buckets.get(k) || this.buckets.set(k, []).get(k)).push(v);
        }
      }
    }
  }

  /** Otomatik tamamlama: her sorgu kelimesi ismin bir kelimesinin başı olmalı.
      Aynı adlı futbolcular için ayırt edici olarak uyruk bayrağı gider (doğum yılı değil). */
  search(q, limit = 8) {
    const qt = tokens(String(q).slice(0, 48));
    if (!qt.length || qt.join('').length < 2) return [];
    const pivot = qt.reduce((a, b) => (b.length > a.length ? b : a));
    if (pivot.length < 2) return [];
    const bucket = this.buckets.get(pivot.slice(0, 2)) || [];
    const qFull = qt.join(' ');
    const seen = new Set();
    const hits = [];
    for (const v of bucket) {
      const va = this.variants[v];
      if (seen.has(va.i)) continue;
      if (!qt.every((t) => va.toks.some((x) => x.startsWith(t)))) continue;
      seen.add(va.i);
      const rank = va.full === qFull ? 0 : va.full.startsWith(qFull) ? 1 : 2;
      hits.push({ va, rank });
      if (hits.length >= 80) break;
    }
    hits.sort((a, b) => a.rank - b.rank || a.va.i - b.va.i);
    const out = hits.slice(0, limit).map(({ va }) => {
      const p = this.players[va.i];
      return { id: p.i, name: p.name, alias: va.alias ? va.text : undefined };
    });
    const dup = new Set();
    const seenName = new Set();
    for (const it of out) {
      const k = fold(it.name);
      if (seenName.has(k)) dup.add(k);
      seenName.add(k);
    }
    for (const it of out) {
      if (!dup.has(fold(it.name))) continue;
      const c = this.byType.nat?.[this.players[it.id].nats[0]];
      if (c) it.flag = c.flag;
    }
    return out;
  }
}
