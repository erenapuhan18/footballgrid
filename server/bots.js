/* Botlar: host lobide ekler ya da eşleştirmede rakip bulunamazsa koltukları doldurur.
   Sırayla modunda: önce hücreyi seçer (herkes görsün), biraz "düşünür", sonra cevaplar ya da pas geçer.
   Aynı anda modunda: birkaç saniyede bir boş bir hücreye cevap dener; yanlışta cezayı bekler.

   Üç seviye: Kolay yalnız en tanınmış futbolcuları bilir ve yavaş oynar, Zor derin listeden seçer ve
   kazanan/engelleyen hücreyi kaçırmaz. */

import { sameNick } from './nickname.js';

export const BOT_NAMES = ['Libero', 'Stoper', 'Pivot', 'Onuncu', 'Golcü', 'Kanat', 'Kaptan', 'Joker', 'Bek', 'Santrfor'];

export const BOT_LEVELS = {
  kolay: { name: 'Kolay', skill: 0.42, depth: 4, think: [4200, 9000], race: [7000, 13000], smart: 0.15, wrong: 0.7 },
  orta: { name: 'Orta', skill: 0.7, depth: 10, think: [2200, 6800], race: [3500, 9000], smart: 0.8, wrong: 0.55 },
  zor: { name: 'Zor', skill: 0.92, depth: 24, think: [1400, 3800], race: [2200, 5200], smart: 1, wrong: 0.35 },
};
export const BOT_LEVEL_KEYS = Object.keys(BOT_LEVELS);
export const DEFAULT_LEVEL = 'orta';
export const botLevel = (k) => BOT_LEVELS[k] || BOT_LEVELS[DEFAULT_LEVEL];

// Uzman modunda herkes zorlanır
const MODE_SKILL = { klasik: 1, hizli: 0.95, uzman: 0.8 };

export function pickBotName(takenNicks) {
  return BOT_NAMES.find((n) => !takenNicks.some((t) => sameNick(t, n))) || `Bot${Math.floor(Math.random() * 90 + 10)}`;
}

const levelOf = (game, pid) => botLevel(game.players.get(pid)?.level);

function wouldComplete(game, cell, pid) {
  return game.lines.some((line) => line.includes(cell) && line.every((i) => i === cell || game.cells[i].owner === pid));
}

function chooseCell(game, pid, rng, L) {
  const takeable = game.cells.map((_, i) => i).filter((i) => !game.canTake(pid, i));
  if (!takeable.length) return null;
  const answerable = takeable.filter((i) => {
    const [r, c] = game.catsOf(i);
    return game.db.answers(r, c, 1, game.excluded).length > 0;
  });
  let pool = answerable.length ? answerable : takeable;
  // Uzman'da çoğunlukla boş hücre, arada bir çalma
  const free = pool.filter((i) => !game.cells[i].owner);
  if (free.length && rng() < 0.8) pool = free;

  if (game.lineWin) {
    const win = pool.find((i) => wouldComplete(game, i, pid));
    if (win !== undefined && rng() < Math.max(L.smart, 0.5)) return win;
    const opponents = game.order.filter((p) => p !== pid);
    const block = pool.find((i) => opponents.some((o) => wouldComplete(game, i, o)));
    if (block !== undefined && rng() < L.smart) return block;
    const center = (game.cells.length - 1) / 2;
    if (pool.includes(center) && rng() < 0.6 * L.smart) return center;
  }
  return pool[Math.floor(rng() * pool.length)];
}

/** Doğru ya da makul bir yanlış cevap verir; hiçbiri yoksa false döner. */
function attempt(game, pid, cell, rng, L) {
  const [row, col] = game.catsOf(cell);
  if (rng() < L.skill * (MODE_SKILL[game.mode] ?? 1)) {
    const opts = game.db.answers(row, col, L.depth, game.excluded).filter((p) => p.i !== game.cells[cell].fid);
    if (opts.length) {
      game.answer(pid, cell, opts[Math.floor(rng() ** 1.6 * opts.length)].i);
      return true;
    }
  }
  if (rng() < L.wrong) {
    // makul bir yanlış: satır şartına uyan ama sütuna uymayan tanınmış biri
    const wrong = game.db.answers(row, row, 40, game.used).filter((p) => !game.db.matches(p, col));
    if (wrong.length) {
      game.answer(pid, cell, wrong[Math.floor(rng() * wrong.length)].i);
      return true;
    }
  }
  return false;
}

/** Sırayla modunda botun sırasını oynar; iptal fonksiyonu döner. */
export function playBotTurn(game, pid, rng = Math.random) {
  const L = levelOf(game, pid);
  const no = game.turn.no;
  const alive = () => !game.over && game.turn && game.turn.no === no;
  const think = Math.max(1200, Math.min(game.turnMs - 1500, L.think[0] + rng() * (L.think[1] - L.think[0])));
  const cell = chooseCell(game, pid, rng, L);
  const timers = [
    setTimeout(() => {
      if (alive() && cell !== null) game.select(pid, cell);
    }, Math.min(700 + rng() * 900, think * 0.45)),
    setTimeout(() => {
      if (!alive()) return;
      if (cell === null || !attempt(game, pid, cell, rng, L)) game.pass(pid);
    }, think),
  ];
  return () => timers.forEach(clearTimeout);
}

/** Aynı anda modunda botu maç bitene kadar oynatır; iptal fonksiyonu döner. */
export function runRaceBot(game, pid, rng = Math.random) {
  const L = levelOf(game, pid);
  let timer = null;
  const loop = () => {
    timer = setTimeout(() => {
      if (game.over) return;
      const me = game.players.get(pid);
      if (me && !me.left && me.cooldownUntil <= Date.now()) {
        const cell = chooseCell(game, pid, rng, L);
        if (cell !== null) attempt(game, pid, cell, rng, L);
      }
      if (!game.over) loop();
    }, L.race[0] + rng() * (L.race[1] - L.race[0]));
  };
  loop();
  return () => clearTimeout(timer);
}
