/* Izgara üretici. Satırlar kulüp (Uzman'da bir satır ülke/lig/kupa olabilir); sütunlar bir
   "tür planı"yla kurulur: 1-2 kulüp + ülke / lig / kupa / menajer / joker (/ mevki) karışımı.
   Her hücrenin moda uygun sayıda bilinebilir cevabı olmalı; bariz hücreler seçilmez.
   Türk büyükleri (özellikle FB ve BJK) öne çıkar; Klasik/Hızlı'da her ızgarada en az biri bulunur. */

export const MODES = {
  klasik: { tiers: ['k'], knownSl: 15, minAnswers: 3, starSl: 30, turk: true, natChance: 1 },
  hizli: { tiers: ['k'], knownSl: 15, minAnswers: 3, starSl: 30, turk: true, natChance: 1 },
  uzman: { tiers: ['k', 'u'], knownSl: 5, minAnswers: 2, starSl: 0, turk: true, natChance: 0.7, altRow: 0.35, needExpert: 2 },
};

// Sütunda kulüp dışı türlerin seçilme ağırlıkları
const TYPE_WEIGHT = {
  klasik: { nat: 3, cup: 2.5, mgr: 2, wild: 2, lg: 1.5 },
  hizli: { nat: 3, cup: 2.5, mgr: 2, wild: 2, lg: 1.5 },
  uzman: { nat: 2, cup: 2, mgr: 2.2, wild: 2, lg: 1.5, pos: 1 },
};
const TURK = { fb: 4, bjk: 4, gs: 3, ts: 2.5 };

function trivial(row, col) {
  const [a, b] = row.type === 'club' ? [row, col] : col.type === 'club' ? [col, row] : [null, null];
  if (!a) return false;
  if (b.type === 'nat') return a.nation === b.natKey;
  if (b.type === 'lg') return a.league === b.lgKey;
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
  const turkClubs = clubs.filter((c) => TURK[c.clubKey]);

  const cellOk = (r, c) =>
    !trivial(r, c) &&
    db.count(r, c, known) >= M.minAnswers &&
    (!starLimit || db.count(r, c, starLimit) >= 1);

  for (let attempt = 0; attempt < 3000; attempt++) {
    const taken = new Set();
    const rows = [];
    while (rows.length < size) {
      const r = weightedPick(clubs, weight, rng, taken);
      if (!r) break;
      rows.push(r);
      taken.add(r.key);
    }
    if (rows.length < size) continue;
    if (M.turk && !rows.some((r) => TURK[r.clubKey])) {
      const t = weightedPick(turkClubs, weight, rng, taken);
      if (t) {
        taken.delete(rows[size - 1].key);
        rows[size - 1] = t;
        taken.add(t.key);
      }
    }
    if (M.altRow && rng() < M.altRow) {
      const types = ['nat', 'lg', 'cup'].filter((t) => byType[t]?.length);
      const t = types[Math.floor(rng() * types.length)];
      const alt = t && weightedPick(byType[t], weight, rng, taken);
      if (alt && !TURK[rows[0].clubKey]) {
        taken.delete(rows[0].key);
        rows[0] = alt;
        taken.add(alt.key);
      }
    }

    // sütun tür planı: 1-2 kulüp + bir ülke (Klasik/Hızlı'da her zaman) + farklı türler
    const nClubs = size === 3 ? (rng() < 0.25 ? 2 : 1) : rng() < 0.4 ? 2 : 1;
    const plan = Array(nClubs).fill('club');
    const left = [...otherTypes];
    if (left.includes('nat') && rng() < M.natChance) {
      plan.push('nat');
      left.splice(left.indexOf('nat'), 1);
    }
    while (plan.length < size && left.length) {
      const t = pickType(left, TW, rng);
      plan.push(t);
      left.splice(left.indexOf(t), 1);
    }
    while (plan.length < size) plan.push('club');

    const cols = [];
    let ok = true;
    for (const t of plan) {
      const cands = (t === 'club' ? clubs : byType[t]).filter((c) => !taken.has(c.key) && rows.every((r) => cellOk(r, c)));
      if (!cands.length) {
        ok = false;
        break;
      }
      const c = weightedPick(cands, weight, rng, taken);
      cols.push(c);
      taken.add(c.key);
    }
    if (!ok) continue;
    if (M.needExpert && [...rows, ...cols].filter((c) => c.tier === 'u').length < M.needExpert) continue;
    return { rows, cols: shuffle(cols, rng) };
  }
  throw new Error(`ızgara üretilemedi (${mode} ${size}×${size})`);
}
