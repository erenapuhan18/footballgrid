/* Botlar: host lobide ekler ya da eşleştirmede rakip bulunamazsa koltukları doldurur.
   Önce hücreyi seçer (herkes görsün), biraz "düşünür", sonra cevaplar ya da pas geçer. */

import { sameNick } from './nickname.js';

export const BOT_NAMES = ['Libero', 'Stoper', 'Pivot', 'Onuncu', 'Golcü', 'Kanat', 'Kaptan', 'Joker', 'Bek', 'Santrfor'];
const SKILL = { klasik: 0.72, hizli: 0.68, uzman: 0.56 };

export function pickBotName(takenNicks) {
  return BOT_NAMES.find((n) => !takenNicks.some((t) => sameNick(t, n))) || `Bot${Math.floor(Math.random() * 90 + 10)}`;
}

function wouldComplete(game, cell, pid) {
  return game.lines.some((line) => line.includes(cell) && line.every((i) => i === cell || game.cells[i].owner === pid));
}

function chooseCell(game, pid, rng) {
  const takeable = game.cells.map((_, i) => i).filter((i) => !game.canTake(pid, i));
  if (!takeable.length) return null;
  const answerable = takeable.filter((i) => {
    const [r, c] = game.catsOf(i);
    return game.db.answers(r, c, 1, game.used).length > 0;
  });
  let pool = answerable.length ? answerable : takeable;
  // Uzman'da çoğunlukla boş hücre, arada bir çalma
  const free = pool.filter((i) => !game.cells[i].owner);
  if (free.length && rng() < 0.8) pool = free;

  if (game.lineWin) {
    const win = pool.find((i) => wouldComplete(game, i, pid));
    if (win !== undefined) return win;
    const opponents = game.order.filter((p) => p !== pid);
    const block = pool.find((i) => opponents.some((o) => wouldComplete(game, i, o)));
    if (block !== undefined && rng() < 0.85) return block;
    const center = (game.cells.length - 1) / 2;
    if (pool.includes(center) && rng() < 0.6) return center;
  }
  return pool[Math.floor(rng() * pool.length)];
}

/** Botun sırasını oynar; iptal fonksiyonu döner (sıra değişince/oda kapanınca çağrılır). */
export function playBotTurn(game, pid, rng = Math.random) {
  const no = game.turn.no;
  const alive = () => !game.over && game.turn && game.turn.no === no;
  const think = Math.max(1200, Math.min(game.turnMs - 1500, 2200 + rng() * 4800));
  const cell = chooseCell(game, pid, rng);
  const timers = [
    setTimeout(() => {
      if (alive() && cell !== null) game.select(pid, cell);
    }, Math.min(700 + rng() * 900, think * 0.45)),
    setTimeout(() => {
      if (!alive()) return;
      if (cell === null) return void game.pass(pid);
      const [row, col] = game.catsOf(cell);
      if (rng() < (SKILL[game.mode] ?? 0.65)) {
        const opts = game.db.answers(row, col, 12, game.used);
        if (opts.length) return void game.answer(pid, cell, opts[Math.floor(rng() ** 1.6 * opts.length)].i);
      }
      if (rng() < 0.55) {
        // makul bir yanlış: satır şartına uyan ama sütuna uymayan tanınmış biri
        const wrong = game.db.answers(row, row, 40, game.used).filter((p) => !game.db.matches(p, col));
        if (wrong.length) return void game.answer(pid, cell, wrong[Math.floor(rng() * wrong.length)].i);
      }
      game.pass(pid);
    }, think),
  ];
  return () => timers.forEach(clearTimeout);
}
