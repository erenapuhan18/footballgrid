/* FOOTBALLGRID maç motoru.
   Sırayla (turn): sıra gelen oyuncu bir hücre seçer ve satır + sütun şartına uyan bir futbolcu söyler;
     doğru → hücre onun rengine boyanır; yanlış / pas / süre dolması → sıra geçer.
   Aynı anda (race): sıra yok; herkes istediği hücreye cevap verir, ilk doğru bilen hücreyi kapar;
     yanlış cevap 3 sn ceza getirir; maç süresi dolunca biter.
   Kazanma: 2 kişide ya da 3'leme kuralında yan yana 3 hücre, yoksa en çok hücre.
   Uzman: rakibin hücresi başka bir futbolcuyla çalınabilir (çalınan hücre kilitlenir).
   Seçenekler: aynı futbolcu tekrar kullanılabilir (reuse), maç başına 1 ipucu (hints). */

import { EventEmitter } from 'node:events';

export const OFFLINE_TURN_MS = 5000;
export const RACE_PENALTY_MS = 3000;

/** win: 'line3' → yan yana 3 hücre kazanır (2 kişide her zaman), 'most' → en çok hücre. */
export function gameShape(mode, n, win) {
  const size = mode === 'hizli' || n === 2 ? 3 : 4;
  const cells = size * size;
  const factor = mode === 'hizli' ? 0.9 : 1.6;
  return {
    size,
    maxTurns: Math.ceil((cells * factor) / n) * n,
    lineWin: win !== 'points' && (n === 2 || win === 'line3'),
    pointWin: win === 'points', // nadirlik puanı: az bilinen doğru cevap daha çok puan
    steal: mode === 'uzman',
  };
}

/** Izgaradaki bütün yan yana `len` hücrelik diziler (yatay, dikey, iki çapraz). */
export function linesFor(size, len = size) {
  const L = [];
  const at = (r, c) => r * size + c;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const er = r + dr * (len - 1);
        const ec = c + dc * (len - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        L.push(Array.from({ length: len }, (_, k) => at(r + dr * k, c + dc * k)));
      }
    }
  }
  return L;
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let logSeq = 0;

export class Game extends EventEmitter {
  /** players: [{ pid, nick, color, bot }] — grid: { rows, cols } kategori nesneleri */
  constructor({ db, mode, turnTime = 30, players, grid, win, style = 'turn', matchTime = 180, reuse = false, hints = true, rng = Math.random }) {
    super();
    this.db = db;
    this.mode = mode;
    this.turnMs = turnTime * 1000;
    this.rng = rng;
    this.style = style === 'race' ? 'race' : 'turn';
    this.matchMs = matchTime * 1000;
    this.reuse = !!reuse;
    this.hints = !!hints;
    Object.assign(this, gameShape(mode, players.length, win));
    this.lines = linesFor(this.size, 3);
    this.rows = grid.rows;
    this.cols = grid.cols;
    this.cells = Array.from({ length: this.size * this.size }, () => ({ owner: null, fid: null, name: null, locked: false }));
    this.order = shuffle(players.map((p) => p.pid), rng);
    this.players = new Map(
      players.map((p) => [
        p.pid,
        {
          pid: p.pid, nick: p.nick, color: p.color, bot: !!p.bot, level: p.level || null, left: false, online: true, hintUsed: false, cooldownUntil: 0,
          stats: { correct: 0, wrong: 0, pass: 0, timeout: 0, steals: 0 },
        },
      ]),
    );
    this.turnIdx = -1;
    this.turnNo = 0;
    this.turn = null;
    this.deadline = null;
    this.used = new Set();
    this.log = [];
    this.over = false;
    this.result = null;
    this.winLine = null;
    this.timer = null;
  }

  /* ───────── yardımcılar */

  /** Cevap önerirken dışarıda bırakılacaklar (tekrar kullanım açıksa hiçbiri). */
  get excluded() {
    return this.reuse ? null : this.used;
  }

  catsOf(cell) {
    return [this.rows[Math.floor(cell / this.size)], this.cols[cell % this.size]];
  }

  active() {
    return [...this.players.values()].filter((p) => !p.left);
  }

  cellsOf(pid) {
    return this.cells.filter((c) => c.owner === pid).length;
  }

  canTake(pid, cell) {
    const c = this.cells[cell];
    if (!c) return 'Geçersiz hücre.';
    if (!c.owner) return null;
    if (!this.steal) return 'Bu hücre dolu.';
    if (c.owner === pid) return 'Bu hücre zaten senin.';
    if (c.locked) return 'Bu hücre kilitli, çalınamaz.';
    return null;
  }

  findLine(pid) {
    return this.lines.find((line) => line.every((i) => this.cells[i].owner === pid)) || null;
  }

  pushLog(entry) {
    const p = this.players.get(entry.pid);
    const e = { id: ++logSeq, at: Date.now(), nick: p?.nick, color: p?.color, ...entry };
    this.log.push(e);
    if (this.log.length > 30) this.log.shift();
    this.emit('log', e);
  }

  changed() {
    this.emit('change');
  }

  /* ───────── akış */

  start() {
    this.startedAt = Date.now();
    if (this.style === 'race') {
      this.deadline = Date.now() + this.matchMs;
      this.timer = setTimeout(() => this.end('time'), this.matchMs);
      this.emit('race');
      this.changed();
      return;
    }
    this.advance();
  }

  advance() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.over) return;
    if (this.active().length < 2) return this.end('forfeit');
    if (this.cells.every((c) => c.owner)) return this.end('full');
    if (this.turnNo >= this.maxTurns) return this.end('turns');

    for (let k = 0; k < this.order.length; k++) {
      this.turnIdx = (this.turnIdx + 1) % this.order.length;
      if (!this.players.get(this.order[this.turnIdx]).left) break;
    }
    this.turnNo++;
    const pid = this.order[this.turnIdx];
    const p = this.players.get(pid);
    const ms = p.online ? this.turnMs : Math.min(this.turnMs, OFFLINE_TURN_MS);
    this.turn = { pid, no: this.turnNo, endsAt: Date.now() + ms, selected: null };
    const no = this.turnNo;
    this.timer = setTimeout(() => this.timeout(no), ms);
    this.emit('turn', this.turn);
    this.changed();
  }

  timeout(no) {
    if (this.over || !this.turn || this.turn.no !== no) return;
    const p = this.players.get(this.turn.pid);
    p.stats.timeout++;
    this.pushLog({ kind: 'timeout', pid: p.pid });
    this.advance();
  }

  /* ───────── oyuncu eylemleri — hepsi { ok, error? } döner */

  checkTurn(pid) {
    if (this.over) return 'Maç bitti.';
    if (this.style === 'race') {
      const p = this.players.get(pid);
      if (!p || p.left) return 'Bu maçta değilsin.';
      const wait = p.cooldownUntil - Date.now();
      if (wait > 0) return `Yanlış cevap cezası: ${Math.ceil(wait / 1000)} sn bekle.`;
      return null;
    }
    if (!this.turn || this.turn.pid !== pid) return 'Sıra sende değil.';
    return null;
  }

  select(pid, cell) {
    if (this.style === 'race') return { ok: true }; // aynı anda modunda seçim yalnızca oyuncunun kendi ekranında
    const err = this.checkTurn(pid) || (cell === null ? null : this.canTake(pid, cell));
    if (err) return { ok: false, error: err };
    this.turn.selected = cell;
    this.changed();
    return { ok: true };
  }

  answer(pid, cell, fid) {
    const err = this.checkTurn(pid) || (Number.isInteger(cell) ? this.canTake(pid, cell) : 'Önce bir hücre seç.');
    if (err) return { ok: false, error: err };
    const player = Number.isInteger(fid) ? this.db.players[fid] : null;
    if (!player) return { ok: false, error: 'Futbolcu bulunamadı, listeden seç.' };
    if (!this.reuse && this.used.has(fid)) return { ok: false, error: `${player.name} bu maçta zaten kullanıldı.` };
    if (this.cells[cell].fid === fid) return { ok: false, error: 'Bu hücrede zaten o futbolcu var.' };

    const me = this.players.get(pid);
    const [row, col] = this.catsOf(cell);
    const okRow = this.db.matches(player, row);
    const okCol = this.db.matches(player, col);

    if (okRow && okCol) {
      const c = this.cells[cell];
      const from = c.owner;
      this.used.add(fid);
      Object.assign(c, { owner: pid, fid, name: player.name, locked: !!from });
      me.stats.correct++;
      if (from) me.stats.steals++;
      if (this.pointWin) {
        // Nadirlik puanı: hücreye uyanlar arasında cevap ne kadar az tanınmışsa o kadar çok puan (10-100)
        const [pr, pc] = this.catsOf(cell);
        const total = this.db.count(pr, pc);
        const above = this.db.count(pr, pc, player.i); // bu cevaptan daha tanınmış kaç uygun futbolcu var
        const pts = Math.round(10 + 90 * (total > 1 ? Math.min(1, above / (total - 1)) : 0));
        me.stats.points = (me.stats.points || 0) + pts;
        this.cells[cell].pts = pts;
      }
      this.pushLog({ kind: from ? 'steal' : 'correct', pid, cell, name: player.name, from });
      const line = this.lineWin ? this.findLine(pid) : null;
      if (line) {
        this.winLine = line;
        this.end('line');
      } else if (this.style === 'race') {
        if (this.cells.every((x) => x.owner)) this.end('full');
        else this.changed();
      } else {
        this.advance();
      }
      return { ok: true, correct: true };
    }

    me.stats.wrong++;
    const reasons = [!okRow && this.db.failText(row), !okCol && this.db.failText(col)].filter(Boolean);
    this.pushLog({ kind: 'wrong', pid, cell, name: player.name, reasons });
    if (this.style === 'race') {
      me.cooldownUntil = Date.now() + RACE_PENALTY_MS;
      this.changed();
      return { ok: true, correct: false, reasons, penalty: RACE_PENALTY_MS / 1000 };
    }
    this.advance();
    return { ok: true, correct: false, reasons };
  }

  pass(pid) {
    if (this.style === 'race') return { ok: false, error: 'Aynı anda modunda pas yok; istediğin hücreyi seç.' };
    const err = this.checkTurn(pid);
    if (err) return { ok: false, error: err };
    this.players.get(pid).stats.pass++;
    this.pushLog({ kind: 'pass', pid });
    this.advance();
    return { ok: true };
  }

  /** Maç başına 1 ipucu: olası cevaplardan (öncelikle yakın dönemden) birinin uyruğu, mevkisi ve yaşı. */
  hint(pid, cell) {
    if (!this.hints) return { ok: false, error: 'Bu odada ipucu kapalı.' };
    const err = this.checkTurn(pid) || (Number.isInteger(cell) ? this.canTake(pid, cell) : 'Önce bir hücre seç.');
    if (err) return { ok: false, error: err };
    const me = this.players.get(pid);
    if (me.hintUsed) return { ok: false, error: 'İpucu hakkını bu maçta kullandın.' };
    const [row, col] = this.catsOf(cell);
    const cands = this.db.answers(row, col, 24, this.excluded).filter((p) => p.i !== this.cells[cell].fid);
    if (!cands.length) return { ok: false, error: 'Bu hücre için ipucu bulunamadı.' };
    // Yakın dönem: hâlâ bir kulüpte olan ya da son yıllarda oynamış futbolcular
    const recent = cands.filter((p) => (p.st || []).some(([, , to]) => to === 0 || to >= 2015));
    const pool = recent.length ? recent : cands;
    const p = pool[Math.floor(this.rng() * Math.min(pool.length, 4))];
    me.hintUsed = true;
    this.pushLog({ kind: 'hint', pid, cell });
    this.changed();
    const pos = (this.db.byType.pos || []).filter((c) => c && this.db.matches(p, c)).map((c) => c.name);
    return {
      ok: true,
      hint: { nats: this.db.natNames(p), pos, age: p.by ? new Date().getFullYear() - p.by : null, recent: recent.length > 0 },
    };
  }

  setOnline(pid, online) {
    const p = this.players.get(pid);
    if (!p || p.online === online) return;
    p.online = online;
    // Bağlantısı kopan oyuncunun sırası kısa sürede geçsin.
    if (!online && this.turn?.pid === pid && this.turn.endsAt - Date.now() > OFFLINE_TURN_MS) {
      clearTimeout(this.timer);
      this.turn.endsAt = Date.now() + OFFLINE_TURN_MS;
      const no = this.turn.no;
      this.timer = setTimeout(() => this.timeout(no), OFFLINE_TURN_MS);
    }
    this.changed();
  }

  leave(pid) {
    const p = this.players.get(pid);
    if (!p || p.left || this.over) return;
    p.left = true;
    this.pushLog({ kind: 'left', pid });
    if (this.active().length < 2) return this.end('forfeit');
    if (this.turn?.pid === pid) return this.advance();
    this.changed();
  }

  end(reason) {
    if (this.over) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.over = true;
    this.turn = null;

    const active = this.active();
    let winners;
    if (reason === 'line') {
      winners = [this.cells[this.winLine[0]].owner];
    } else if (reason === 'forfeit') {
      winners = active.map((p) => p.pid);
    } else if (this.lineWin) {
      // 3'leme kuralı: üçleyen yoksa beraberlik — ilk başlayan fazladan hücreyle kazanmış sayılmasın
      winners = [];
    } else {
      const val = this.pointWin ? (p) => p.stats.points || 0 : (p) => this.cellsOf(p.pid);
      const best = Math.max(0, ...active.map(val));
      winners = best === 0 ? [] : active.filter((p) => val(p) === best).map((p) => p.pid);
    }

    const all = [...this.players.values()];
    const score = (p) =>
      (winners.includes(p.pid) ? 1000 : 0) + (p.left ? -500 : 0) + (this.pointWin ? p.stats.points || 0 : this.cellsOf(p.pid) * 10) + p.stats.correct;
    all.sort((a, b) => score(b) - score(a));
    let rank = 0;
    let prev = null;
    const standings = all.map((p, i) => {
      const s = score(p);
      if (s !== prev) rank = i + 1;
      prev = s;
      return { pid: p.pid, nick: p.nick, color: p.color, bot: p.bot, left: p.left, cells: this.cellsOf(p.pid), rank, ...p.stats };
    });

    const answers = this.cells.map((c, i) => {
      const [row, col] = this.catsOf(i);
      const alts = this.db
        .answers(row, col, 5, this.excluded)
        .filter((p) => p.i !== c.fid)
        .slice(0, 4)
        .map((p) => ({ id: p.i, name: p.name }));
      return { alts, total: this.db.count(row, col) };
    });

    this.result = {
      reason,
      winners,
      draw: winners.length !== 1,
      standings,
      answers,
      winLine: this.winLine,
      turns: this.turnNo,
      durationMs: Date.now() - (this.startedAt || Date.now()),
    };
    this.emit('end', this.result);
    this.changed();
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
    this.removeAllListeners();
  }

  snapshot() {
    return {
      mode: this.mode,
      style: this.style,
      size: this.size,
      steal: this.steal,
      lineWin: this.lineWin,
      pointWin: this.pointWin,
      reuse: this.reuse,
      hints: this.hints,
      maxTurns: this.maxTurns,
      turnNo: this.turnNo,
      turnMs: this.turnMs,
      matchMs: this.matchMs,
      deadline: this.deadline,
      rows: this.rows.map((c) => this.db.publicCat(c)),
      cols: this.cols.map((c) => this.db.publicCat(c)),
      cells: this.cells.map((c) => ({ owner: c.owner, name: c.name, locked: c.locked, fid: c.fid })),
      turn: this.turn && { pid: this.turn.pid, no: this.turn.no, endsAt: this.turn.endsAt, selected: this.turn.selected },
      order: this.order,
      players: [...this.players.values()].map((p) => ({
        pid: p.pid, nick: p.nick, color: p.color, bot: p.bot, level: p.level, left: p.left, online: p.online,
        cells: this.cellsOf(p.pid), points: p.stats.points || 0, correct: p.stats.correct, wrong: p.stats.wrong,
        hintUsed: p.hintUsed, cooldownUntil: p.cooldownUntil,
      })),
      log: this.log.slice(-8),
      over: this.over,
      result: this.result,
    };
  }
}
