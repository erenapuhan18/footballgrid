/* Izgara üretici. Başlıklar dengeli dağılır: kulüpler azınlıkta kalır, geri kalan yerler ülke / lig /
   kupa / menajer / takım arkadaşı / joker (Uzman'da mevki) arasından, her türden en fazla bir tane.
   Aynı tür içinde bütün başlıkların çıkma şansı eşittir (tanınmışlığa göre ağırlık yok); yalnızca son
   maçlarda çıkmış başlıklar geri plana atılır. Izgaraların trChance kadarında bir kulüp yuvası Süper Lig'e
   ayrılır ve o yuva Türk kulüpleri arasından eşit şansla çekilir — hep aynı üç büyük çıkmaz. Türk kulübü
   genel kulüp havuzunda yoktur: bir ızgarada en çok bir Türk kulübü olur (yoksa "Türk × Türk" hücreleri
   kolay tuttuğu için üç büyük geri gelirdi).
   Her hücrenin moda uygun sayıda bilinebilir cevabı olmalı; bariz hücreler seçilmez.
   Oda ayarındaki `cats` ile kulüp dışındaki başlık türleri tek tek kapatılabilir. */

export const MODES = {
  klasik: { tiers: ['k'], knownSl: 15, minAnswers: 3, starSl: 30, trChance: 0.8, trAnyTier: true, trStars: 20, natChance: 1 },
  hizli: { tiers: ['k'], knownSl: 15, minAnswers: 3, starSl: 30, trChance: 0.8, trAnyTier: true, trStars: 20, natChance: 1 },
  uzman: { tiers: ['k', 'u'], knownSl: 5, minAnswers: 2, starSl: 0, trChance: 0.7, natChance: 0.7, needExpert: 2 },
};

/** Kulüp dışındaki başlık türleri — oda ayarlarında açılıp kapatılabilir. Kulüp her zaman açık. */
export const CAT_TYPES = ['nat', 'lg', 'cup', 'mgr', 'mate', 'wild', 'ht', 'pos'];

// Hangi türün kaç yuva alacağını belirleyen ağırlıklar (tür içinde seçim eşit şanslı)
const TYPE_WEIGHT = {
  klasik: { nat: 3, cup: 2.5, mgr: 2, mate: 2, wild: 2.2, lg: 1.5, ht: 1.5 },
  hizli: { nat: 3, cup: 2.5, mgr: 2, mate: 2, wild: 2.2, lg: 1.5, ht: 1.5 },
  uzman: { nat: 2, cup: 2, mgr: 2.2, mate: 2, wild: 2.2, lg: 1.5, ht: 1.5, pos: 1 },
};
const RECENT_PENALTY = 0.12; // son maçlarda çıkmış başlığın ağırlığı

/* Bir özel şartın kendiliğinden getirdiği kupa: "3+ ŞL × ŞL kazandı" hücresi bedava olurdu.
   (Finalde gol atmak kupayı getirmez — o çift bilerek yok.) */
const IMPLIES_CUP = {
  ucl3: ['ucl'],
  uclwc: ['ucl', 'wc'],
  uclfinal: ['ucl'],
  wcfinal: ['wc'],
  treble: ['ucl'],
  lt3esp: ['esp'],
  lt3eng: ['eng'],
  lt3ita: ['ita'],
  lt3ger: ['ger'],
  lt3tr1: ['tr1'],
};

/** Cevabı baştan belli eden başlık çiftleri. (testte kullanılıyor) */
export function trivial(row, col) {
  const pair = (t1, t2) =>
    row.type === t1 && col.type === t2 ? [row, col] : col.type === t1 && row.type === t2 ? [col, row] : null;
  const cn = pair('club', 'nat');
  if (cn) return cn[0].nation === cn[1].natKey;
  const cl = pair('club', 'lg');
  if (cl) return cl[0].league === cl[1].lgKey;
  const lc = pair('lg', 'cup');
  if (lc) return lc[0].lgKey === lc[1].cupKey; // "Premier Lig'de oynadı × Premier Lig şampiyonu"
  const wl = pair('wild', 'lg');
  if (wl) return wl[0].wildKey === 'trforeign' && wl[1].lgKey === 'tr1';
  const wn = pair('wild', 'nat');
  if (wn) return wn[0].wildKey === 'trabroad' && wn[1].natKey === 'tr';
  const wc = pair('wild', 'cup');
  if (wc) return (IMPLIES_CUP[wc[0].wildKey] || []).includes(wc[1].cupKey);
  return false;
}

function weightedPick(items, weight, rng, taken) {
  const pool = items.filter((x) => !taken.has(x.key));
  let total = 0;
  for (const x of pool) total += weight(x);
  let r = rng() * total;
  for (const x of pool) if ((r -= weight(x)) <= 0) return x;
  return pool.at(-1);
}

function pickType(types, w, rng) {
  let total = 0;
  for (const t of types) total += w[t];
  let r = rng() * total;
  for (const t of types) if ((r -= w[t]) <= 0) return t;
  return types.at(-1);
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Oda ayarından gelen tür listesini süzer; dizi değilse hepsi açık sayılır. */
export function normCats(cats) {
  return Array.isArray(cats) ? CAT_TYPES.filter((t) => cats.includes(t)) : [...CAT_TYPES];
}

const OFF_MAX = 600; // kapatılabilecek en fazla başlık (veri kümesinde ~300 var)
/** Tek tek kapatılmış başlık anahtarları ("mgr:Q79983"). `known` verilirse tanınmayan anahtar atılır
    (eski derlemeden kalan anahtar ayarlarda birikmesin). */
export function normOff(off, known = null) {
  if (!Array.isArray(off)) return [];
  const ok = (k) => typeof k === 'string' && /^[a-z]+:[A-Za-z0-9_-]{1,48}$/.test(k) && (!known || known.has(k));
  return [...new Set(off.filter(ok))].sort().slice(0, OFF_MAX);
}

/** { rows, cols } — kategori nesneleri. `avoid`: son maçların başlık anahtarları. `cats`: açık türler. */
export function makeGrid(db, mode, size, { rng = Math.random, avoid = new Set(), cats = null, off = null } = {}) {
  const M = MODES[mode] || MODES.klasik;
  const TW = TYPE_WEIGHT[mode] || TYPE_WEIGHT.klasik;
  const allowed = new Set(cats ? normCats(cats) : CAT_TYPES);
  const shut = off?.length ? new Set(off) : null; // ayarlarda tek tek kapatılmış başlıklar
  const open = (c) => !shut?.has(c.key);
  const known = db.knownLimit(M.knownSl);
  const starLimit = M.starSl ? db.knownLimit(M.starSl) : 0;
  const inTier = (c) => M.tiers.includes(c.tier);
  const own = (c) => db.count(c, c, known);

  // Türk kulüpleri: Klasik/Hızlı'da alt kademedekiler de havuza girer, ama tanınmış futbolcusu az olanlar
  // (Samsunspor, Eskişehirspor…) yalnız Uzman'a kalır — yoksa bütün ızgara onların etrafına kurulur.
  const trClubs = db.cats.filter(
    (c) =>
      c.type === 'club' &&
      c.nation === 'tr' &&
      (inTier(c) || M.trAnyTier) &&
      open(c) &&
      own(c) >= 12 &&
      (!M.trStars || db.count(c, c, starLimit) >= M.trStars),
  );
  // Genel kulüp havuzunda Türk kulübü yok: ayrılmış yuvadan tek bir Türk kulübü girer (o da her maçta değil).
  // Yoksa "Türk kulübü × Türk kulübü" hücreleri kolay tuttuğu için hep aynı üç büyük geri gelirdi.
  // Küçük veri kümelerinde (test) yabancı kulüp yetmezse ayırma yapılmaz.
  const allClubs = db.cats.filter((c) => c.type === 'club' && inTier(c) && open(c) && own(c) >= 12);
  const foreign = allClubs.filter((c) => c.nation !== 'tr');
  const clubs = trClubs.length && foreign.length >= size * 2 ? foreign : allClubs;
  const byType = {};
  for (const c of db.cats) {
    if (c.type !== 'club' && allowed.has(c.type) && TW[c.type] && inTier(c) && open(c) && own(c) >= 8) (byType[c.type] ||= []).push(c);
  }
  // Kapalı kriterler ızgarayı imkânsız kılıyorsa erken ve anlaşılır dur
  if (clubs.length + trClubs.length < size + 1) {
    throw new Error(`ızgara üretilemedi (${mode} ${size}×${size}) — açık kulüp sayısı yetersiz (${clubs.length + trClubs.length})`);
  }
  const otherTypes = Object.keys(TW).filter((t) => byType[t]?.length);
  const pool = (t, tr) => (t === 'club' ? clubs : t === 'trclub' ? (tr ? [tr] : trClubs) : byType[t]);
  // Tür içinde eşit şans; yalnız son maçlarda çıkan başlıklar geri planda
  const weight = (c) => (avoid.has(c.key) ? RECENT_PENALTY : 1);

  const cellOk = (r, c) =>
    !trivial(r, c) &&
    db.count(r, c, known) >= M.minAnswers &&
    (!starLimit || db.count(r, c, starLimit) >= 1);

  const fails = { plan: 0, rows: 0, cols: 0, expert: 0 };
  // Türk kulübü baştan çekilir ve ızgara onun etrafında kurulur. Denemeyi kulüp değiştirerek tekrarlamak
  // az bağlantılı kulüpleri (Göztepe, Konyaspor…) elerdi; kuyruk sırası eşitliği korur.
  // Her maçta Türk kulübü şart değil: trChance kadarında ayrılmış yuva açılır, kalanında ızgara tamamen serbest.
  const trQueue = trClubs.length && rng() < M.trChance ? shuffle([...trClubs], rng) : [null];
  if (avoid.size) trQueue.sort((a, b) => (avoid.has(a?.key) ? 1 : 0) - (avoid.has(b?.key) ? 1 : 0));
  const BUDGET = Math.ceil(3000 / trQueue.length);

  for (const forcedTr of trQueue) {
    const g = tryGrid(forcedTr, BUDGET);
    if (g) return g;
  }
  throw new Error(`ızgara üretilemedi (${mode} ${size}×${size}) — ${JSON.stringify(fails)}`);

  function tryGrid(forcedTr, budget) {
    for (let attempt = 0; attempt < budget; attempt++) {
      // Tür planı: 2×size başlığın yarısından azı kulüp, kalanı farklı türlerden birer tane.
      // Dengeli plan tutmazsa kademeli gevşe: önce kulüp sayısını artır, en sonda satırların hepsi kulüp olsun.
      const phase = attempt < budget * 0.4 ? 0 : attempt < budget * 0.8 ? 1 : 2;
      const nClubs = phase === 2 ? size + (size === 3 ? 1 : 2) : phase === 1 ? size + (rng() < 0.5 ? 1 : 0) : size === 3 ? (rng() < 0.5 ? 3 : 2) : rng() < 0.5 ? 4 : 3;
      const slots = Array(nClubs).fill('club');
      const left = [...otherTypes];
      if (left.includes('nat') && rng() < M.natChance) {
        slots.push('nat');
        left.splice(left.indexOf('nat'), 1);
      }
      while (slots.length < size * 2 && left.length) {
        const t = pickType(left, TW, rng);
        slots.push(t);
        left.splice(left.indexOf(t), 1);
      }
      while (slots.length < size * 2) slots.push('club');
      shuffle(slots, rng);
      // Son çare (küçük veri kümeleri): eski düzen — satırların hepsi kulüp, karışım sütunlarda
      const rowTypes = phase === 2 ? Array(size).fill('club') : slots.slice(0, size);
      const colTypes = phase === 2 ? ['club', ...slots.filter((t) => t !== 'club')].slice(0, size) : slots.slice(size);
      while (colTypes.length < size) colTypes.push('club');
      // Her iki eksende de en az bir kulüp: hücreler cevaplanabilir kalsın
      if (!rowTypes.includes('club') || !colTypes.includes('club')) {
        fails.plan++;
        continue;
      }
      // Kulüp yuvalarından rastgele biri Süper Lig'e ayrılır; Türk kulüplerinin hepsi aynı oranda.
      // Türk kulübünün ekseni ilk seçilir, diğer eksen ona göre süzülür — zayıf kulüpler de tutunabilsin.
      let firstTypes = rowTypes;
      let secondTypes = colTypes;
      let flip = false;
      if (forcedTr) {
        const spots = [];
        rowTypes.forEach((t, i) => t === 'club' && spots.push([rowTypes, i, true]));
        colTypes.forEach((t, i) => t === 'club' && spots.push([colTypes, i, false]));
        const [arr, i, isRow] = spots[Math.floor(rng() * spots.length)];
        arr[i] = 'trclub';
        if (!isRow) {
          firstTypes = colTypes;
          secondTypes = rowTypes;
          flip = true;
        }
      }

      const taken = new Set();
      const first = [];
      let ok = true;
      for (const t of firstTypes) {
        const r = weightedPick(pool(t, forcedTr), weight, rng, taken);
        if (!r) {
          ok = false;
          break;
        }
        first.push(r);
        taken.add(r.key);
      }
      if (!ok) {
        fails.rows++;
        continue;
      }

      const second = [];
      for (const t of secondTypes) {
        const cands = pool(t, forcedTr).filter((c) => !taken.has(c.key) && first.every((r) => cellOk(r, c)));
        if (!cands.length) {
          ok = false;
          break;
        }
        const c = weightedPick(cands, weight, rng, taken);
        second.push(c);
        taken.add(c.key);
      }
      if (!ok) {
        fails.cols++;
        continue;
      }
      const all = [...first, ...second];
      if (M.needExpert && phase < 2 && all.filter((c) => c.tier === 'u').length < M.needExpert) {
        fails.expert++;
        continue;
      }
      return flip ? { rows: second, cols: first } : { rows: first, cols: second };
    }
    return null;
  }
}
