/* Izgara üretici. Başlıklar dengeli dağılır: kulüpler azınlıkta kalır, geri kalan yerler ülke / lig /
   kupa / menajer / takım arkadaşı / joker (Uzman'da mevki) arasından, her türden en fazla bir tane.
   Her hücrenin moda uygun sayıda bilinebilir cevabı olmalı; bariz hücreler seçilmez.
   Türk büyükleri (özellikle FB ve BJK) öne çıkar; Klasik/Hızlı'da her ızgarada en az biri bulunur. */

export const MODES = {
  klasik: { tiers: ['k'], knownSl: 15, minAnswers: 3, starSl: 30, turk: true, natChance: 1 },
  hizli: { tiers: ['k'], knownSl: 15, minAnswers: 3, starSl: 30, turk: true, natChance: 1 },
  uzman: { tiers: ['k', 'u'], knownSl: 5, minAnswers: 2, starSl: 0, turk: true, natChance: 0.7, needExpert: 2 },
};

// Kulüp dışı türlerin seçilme ağırlıkları
const TYPE_WEIGHT = {
  klasik: { nat: 3, cup: 2.5, mgr: 2, mate: 2, wild: 2.2, lg: 1.5 },
  hizli: { nat: 3, cup: 2.5, mgr: 2, mate: 2, wild: 2.2, lg: 1.5 },
  uzman: { nat: 2, cup: 2, mgr: 2.2, mate: 2, wild: 2.2, lg: 1.5, pos: 1 },
};
const TURK = { fb: 4, bjk: 4, gs: 3, ts: 2.5 };

/** Cevabı baştan belli eden başlık çiftleri. */
function trivial(row, col) {
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
  if (wc) return wc[0].wildKey === 'ucl2' ? wc[1].cupKey === 'ucl' : wc[0].wildKey === 'lt3' + wc[1].cupKey;
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

/** { rows, cols } — kategori nesneleri. `avoid`: bir önceki maçın başlık anahtarları. */
export function makeGrid(db, mode, size, { rng = Math.random, avoid = new Set() } = {}) {
  const M = MODES[mode] || MODES.klasik;
  const TW = TYPE_WEIGHT[mode] || TYPE_WEIGHT.klasik;
  const known = db.knownLimit(M.knownSl);
  const starLimit = M.starSl ? db.knownLimit(M.starSl) : 0;
  const inTier = (c) => M.tiers.includes(c.tier);
  const own = (c) => db.count(c, c, known);

  const clubs = db.cats.filter((c) => c.type === 'club' && inTier(c) && own(c) >= 12);
  const byType = {};
  for (const c of db.cats) {
    if (c.type !== 'club' && TW[c.type] && inTier(c) && own(c) >= 8) (byType[c.type] ||= []).push(c);
  }
  const otherTypes = Object.keys(TW).filter((t) => byType[t]?.length);
  const weight = (c) =>
    Math.sqrt(own(c)) * (avoid.has(c.key) ? 0.15 : 1) * (c.type === 'club' && M.turk ? TURK[c.clubKey] || 1 : 1);

  const cellOk = (r, c) =>
    !trivial(r, c) &&
    db.count(r, c, known) >= M.minAnswers &&
    (!starLimit || db.count(r, c, starLimit) >= 1);

  const fails = { plan: 0, rows: 0, cols: 0, turk: 0, expert: 0 };
  for (let attempt = 0; attempt < 3000; attempt++) {
    // Tür planı: 2×size başlığın yarısından azı kulüp, kalanı farklı türlerden birer tane.
    // Dengeli plan tutmazsa kademeli gevşe: önce kulüp sayısını artır, en sonda satırların hepsi kulüp olsun.
    const phase = attempt < 1200 ? 0 : attempt < 2400 ? 1 : 2;
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

    const taken = new Set();
    const rows = [];
    let ok = true;
    for (const t of rowTypes) {
      const r = weightedPick(t === 'club' ? clubs : byType[t], weight, rng, taken);
      if (!r) {
        ok = false;
        break;
      }
      rows.push(r);
      taken.add(r.key);
    }
    if (!ok) {
      fails.rows++;
      continue;
    }

    const cols = [];
    for (const t of colTypes) {
      const cands = (t === 'club' ? clubs : byType[t]).filter((c) => !taken.has(c.key) && rows.every((r) => cellOk(r, c)));
      if (!cands.length) {
        ok = false;
        break;
      }
      const c = weightedPick(cands, weight, rng, taken);
      cols.push(c);
      taken.add(c.key);
    }
    if (!ok) {
      fails.cols++;
      continue;
    }
    const all = [...rows, ...cols];
    // Türk büyüğü şartı yalnız havuzda varsa (test verisinde yok)
    if (M.turk && clubs.some((c) => TURK[c.clubKey]) && !all.some((c) => TURK[c.clubKey])) {
      fails.turk++;
      continue;
    }
    if (M.needExpert && all.filter((c) => c.tier === 'u').length < M.needExpert) {
      fails.expert++;
      continue;
    }
    return { rows, cols };
  }
  throw new Error(`ızgara üretilemedi (${mode} ${size}×${size}) — ${JSON.stringify(fails)}`);
}
