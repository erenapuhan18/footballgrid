/* Oda yöneticisi: oda kodu, katılma kuralları, host devri, bağlantı kopması ve maç yaşam döngüsü.

   Durumlar: lobby → countdown (3 sn) → playing → finished → (rövanş) countdown …
   Kapanış: odada hiç insan kalmayınca ya da uzun süre boşta kalınca. Kapanan kodlar
   bir süre "mezar taşı" olarak tutulur; o koda gelen "Bu oda kapatıldı." mesajını görür. */

import { randomBytes } from 'node:crypto';
import { makeCode, normalizeCode } from './codes.js';
import { validateNick, sameNick, suggestNick } from './nickname.js';
import { Game, gameShape } from './game.js';
import { makeGrid, CAT_TYPES, normCats, normOff } from './grid.js';
import { playBotTurn, runRaceBot, pickBotName, BOT_LEVELS, DEFAULT_LEVEL } from './bots.js';

export const COLORS = ['blue', 'red', 'green', 'yellow'];
export const SETTINGS = {
  capacity: [2, 3, 4],
  mode: ['klasik', 'hizli', 'uzman'],
  turnTime: [15, 30, 45, 60],
  win: ['line3', 'most', 'points'],
  style: ['turn', 'race'],
  matchTime: [60, 120, 180, 300],
  rounds: [1, 3, 5], // turnuva: kaç maçlık seri
  cats: CAT_TYPES, // ızgarada hangi başlık türleri çıkabilir (kulüp her zaman var)
};
/** Hızlı maç: sırayla, 3 kişide 3'leme, 4 kişide en çok hücre, ipucu açık, aynı futbolcu bir kez. */
export const quickSettings = (size) => ({
  capacity: size, mode: 'klasik', turnTime: 30, win: size === 4 ? 'most' : 'line3', style: 'turn', matchTime: 180, hints: true, reuse: false,
  cats: [...CAT_TYPES],
  off: [],
});

const LOBBY_GRACE_MS = 45_000; // lobide bağlantısı kopan oyuncu bu süre sonunda odadan çıkar
const GAME_GRACE_MS = 90_000; // maç sırasında
const HOST_GRACE_MS = 15_000; // host bu kadar çevrimdışı kalırsa yetki devredilir
const COUNTDOWN_MS = 3_000;
const RECENT_GRIDS = 3; // kaç maç geriye kadar aynı başlıklardan kaçınılır
const TOMBSTONE_MS = 2 * 3600e3;
const IDLE_ROOM_MS = 3 * 3600e3;

export class RoomError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

function normSettings(s = {}, db = null) {
  const num = (v, allowed, def) => (allowed.includes(Number(v)) ? Number(v) : def);
  const capacity = num(s.capacity, SETTINGS.capacity, 2);
  return {
    capacity,
    mode: SETTINGS.mode.includes(s.mode) ? s.mode : 'klasik',
    turnTime: num(s.turnTime, SETTINGS.turnTime, 30),
    // 2 kişide 3'leme ya da nadirlik puanı; 3 kişide varsayılan 3'leme, 4 kişide en çok hücre
    win: capacity === 2 ? (s.win === 'points' ? 'points' : 'line3') : SETTINGS.win.includes(s.win) ? s.win : capacity === 3 ? 'line3' : 'most',
    rounds: num(s.rounds, SETTINGS.rounds, 1),
    style: SETTINGS.style.includes(s.style) ? s.style : 'turn',
    matchTime: num(s.matchTime, SETTINGS.matchTime, 180),
    hints: s.hints === undefined ? true : s.hints === true || s.hints === 'true',
    reuse: s.reuse === true || s.reuse === 'true',
    cats: normCats(s.cats),
    off: normOff(s.off, db?.catByKey), // tek tek kapatılmış başlıklar ("mgr:Q310623", "cup:uecl"…)
  };
}

class Room {
  constructor(mgr, code, settings, quick) {
    this.mgr = mgr;
    this.code = code;
    this.settings = settings;
    this.quick = quick;
    this.status = 'lobby';
    this.members = [];
    this.hostPid = null;
    this.game = null;
    this.round = 0;
    this.series = { total: settings.rounds || 1, played: 0, wins: {} }; // turnuva: maç sayısı ve kim kaç maç kazandı
    this.watchers = new Set(); // izleyiciler: oda anlık görüntüsünü alırlar, oynayamazlar
    this.recentGrids = []; // son maçların başlık anahtarları (yenisi başta) — aynı başlıklar üst üste gelmesin
    this.startsAt = null;
    this.countdownTimer = null;
    this.botCancel = null;
    this.dirty = false;
    this.createdAt = this.touchedAt = Date.now();
  }

  touch() {
    this.touchedAt = Date.now();
  }

  /** Son maçlarda çıkmış başlıklar — ızgara üretici bunları geri plana atar. */
  avoidCats() {
    return new Set(this.recentGrids.flat());
  }

  humans() {
    return this.members.filter((m) => !m.bot);
  }

  member(pid) {
    return this.members.find((m) => m.pid === pid) || null;
  }

  freeColor() {
    return COLORS.find((c) => !this.members.some((m) => m.color === c));
  }

  joinBlock() {
    if (this.status === 'countdown' || this.status === 'playing') return ['started', 'Bu maç zaten başladı.'];
    if (this.members.length >= this.settings.capacity) return ['full', 'Bu oda dolu.'];
    return null;
  }

  stopBots() {
    this.botCancel?.();
    this.botCancel = null;
    for (const stop of this.raceBots || []) stop();
    this.raceBots = [];
  }

  onTurn(turn) {
    this.stopBots();
    if (this.member(turn.pid)?.bot) this.botCancel = playBotTurn(this.game, turn.pid);
  }

  broadcast() {
    if (this.dirty) return;
    this.dirty = true;
    setImmediate(() => {
      this.dirty = false;
      if (this.status !== 'closed') this.mgr.sendRoom(this);
    });
  }
}

export class RoomManager {
  /** send(session, msg) → yazar; onEnter(session) → oyuncu bir odaya girerken (kuyruktan düşür) */
  constructor({ db, send, onEnter = () => {} }) {
    this.db = db;
    this.send = send;
    this.onEnter = onEnter;
    this.rooms = new Map();
    this.closed = new Map();
  }

  /* ───────── sorgular */

  lookup(rawCode) {
    const code = normalizeCode(rawCode);
    const room = code && this.rooms.get(code);
    if (room) return room;
    if (code && this.closed.has(code)) throw new RoomError('closed', 'Bu oda kapatıldı.');
    throw new RoomError('not_found', 'Bu oda bulunamadı.');
  }

  peek(rawCode) {
    const r = this.lookup(rawCode);
    const block = r.joinBlock();
    return {
      code: r.code,
      status: r.status,
      count: r.members.length,
      capacity: r.settings.capacity,
      mode: r.settings.mode,
      turnTime: r.settings.turnTime,
      host: r.member(r.hostPid)?.nick ?? null,
      error: block ? { code: block[0], message: block[1] } : null,
    };
  }

  roomOf(session) {
    return (session.roomCode && this.rooms.get(session.roomCode)) || null;
  }

  mine(session) {
    const room = this.roomOf(session);
    if (!room || !room.member(session.pid)) throw new RoomError('no_room', 'Bir odada değilsin.');
    return room;
  }

  snapshot(room) {
    return {
      code: room.code,
      status: room.status,
      quick: room.quick,
      settings: room.settings,
      hostPid: room.hostPid,
      startsAt: room.startsAt,
      round: room.round,
      series: room.series,
      watchers: room.watchers.size,
      members: room.members.map((m) => ({
        pid: m.pid,
        nick: m.nick,
        color: m.color,
        bot: m.bot,
        level: m.level || null,
        online: m.online,
        host: m.pid === room.hostPid,
        elo: m.bot ? 1000 : (m.session?.elo ?? 1000),
      })),
      game: room.game ? room.game.snapshot() : null,
    };
  }

  sendRoom(room) {
    const msg = JSON.stringify({ t: 'room', room: this.snapshot(room) });
    for (const m of room.members) if (m.session) this.send(m.session, msg);
    for (const s of room.watchers) this.send(s, msg);
  }

  event(room, e) {
    const msg = JSON.stringify({ t: 'event', ...e });
    for (const m of room.members) if (m.session) this.send(m.session, msg);
    for (const s of room.watchers) this.send(s, msg);
  }

  /* ───────── üyelik */

  detach(session) {
    this.onEnter(session);
    if (session.roomCode) this.leave(session, 'switched');
  }

  addMember(room, session, nick) {
    const m = {
      pid: session.pid,
      nick,
      color: room.freeColor(),
      bot: false,
      online: !!session.ws,
      joinedAt: Date.now(),
      session,
      graceTimer: null,
      hostTimer: null,
    };
    room.members.push(m);
    session.roomCode = room.code;
    session.nick = nick;
    room.touch();
    return m;
  }

  addBotMember(room, level) {
    const m = {
      pid: 'bot_' + randomBytes(4).toString('hex'),
      nick: pickBotName(room.members.map((x) => x.nick)),
      color: room.freeColor(),
      bot: true,
      level: BOT_LEVELS[level] ? level : DEFAULT_LEVEL,
      online: true,
      joinedAt: Date.now(),
      session: null,
    };
    room.members.push(m);
    return m;
  }

  create(session, opts = {}) {
    const v = validateNick(opts.nick);
    if (!v.ok) throw new RoomError('invalid_nick', v.error);
    const settings = normSettings(opts, this.db);
    this.detach(session);
    const code = makeCode((c) => this.rooms.has(c) || this.closed.has(c));
    const room = new Room(this, code, settings, false);
    this.rooms.set(code, room);
    this.addMember(room, session, v.nick);
    room.hostPid = session.pid;
    room.broadcast();
    return room;
  }

  join(session, rawCode, rawNick) {
    const room = this.lookup(rawCode);
    const existing = room.member(session.pid);
    if (existing) {
      // Aynı oyuncu (aynı tarayıcı) ikinci kez giremez; mevcut koltuğuna döner.
      existing.online = !!session.ws;
      existing.session = session;
      session.roomCode = room.code;
      room.broadcast();
      return room;
    }
    const block = room.joinBlock();
    if (block) throw new RoomError(block[0], block[1]);
    const v = validateNick(rawNick);
    if (!v.ok) throw new RoomError('invalid_nick', v.error);
    if (room.members.some((m) => sameNick(m.nick, v.nick))) {
      throw new RoomError('nick_taken', `"${v.nick}" zaten kullanılıyor.`, {
        suggestion: suggestNick(v.nick, room.members.map((m) => m.nick)),
      });
    }
    this.detach(session);
    // detach başka bir odayı kapatmış olabilir; hedef oda hâlâ burada mı?
    if (this.rooms.get(room.code) !== room) throw new RoomError('not_found', 'Bu oda bulunamadı.');
    this.addMember(room, session, v.nick);
    if (!room.member(room.hostPid)) room.hostPid = session.pid;
    this.event(room, { kind: 'joined', nick: v.nick, pid: session.pid });
    room.broadcast();
    return room;
  }

  /** İzleyici: oda dolu ya da maç başlamış olsa da anlık görüntüyü alır, oynayamaz. */
  watch(session, rawCode) {
    const room = this.lookup(rawCode);
    if (room.member(session.pid)) return room; // zaten oyuncu
    this.detach(session);
    this.unwatch(session);
    room.watchers.add(session);
    session.watchCode = room.code;
    this.send(session, { t: 'room', room: this.snapshot(room) });
    room.broadcast();
    return room;
  }

  unwatch(session) {
    const room = session.watchCode ? this.rooms.get(session.watchCode) : null;
    session.watchCode = null;
    if (room?.watchers.delete(session)) room.broadcast();
  }

  /** Eşleştirmeden gelen grup için hazır oda; geri sayım hemen başlar. */
  createQuick(entries, bots, size, level) {
    const code = makeCode((c) => this.rooms.has(c) || this.closed.has(c));
    const room = new Room(this, code, quickSettings(size), true);
    this.rooms.set(code, room);
    for (const { session, nick } of entries) {
      if (session.roomCode) this.leave(session, 'switched');
      let n = nick;
      if (room.members.some((m) => sameNick(m.nick, n))) {
        const taken = room.members.map((m) => m.nick);
        n = [2, 3, 4, 5].map((k) => [...nick].slice(0, 15).join('') + k).find((c) => !taken.some((t) => sameNick(t, c))) || suggestNick(nick, taken);
      }
      this.addMember(room, session, n);
      if (n !== nick) this.send(session, { t: 'event', kind: 'renamed', nick: n, from: nick });
    }
    for (let k = 0; k < bots; k++) this.addBotMember(room, level);
    room.hostPid = entries[0].session.pid;
    this.startCountdown(room);
    return room;
  }

  leave(session, reason = 'left') {
    const room = this.roomOf(session);
    session.roomCode = null;
    if (room) this.removeMember(room, session.pid, reason);
  }

  removeMember(room, pid, reason) {
    const i = room.members.findIndex((m) => m.pid === pid);
    if (i < 0) return;
    const [m] = room.members.splice(i, 1);
    clearTimeout(m.graceTimer);
    clearTimeout(m.hostTimer);
    if (m.session && m.session.roomCode === room.code) m.session.roomCode = null;
    if (m.session && reason === 'timeout') {
      this.send(m.session, { t: 'event', kind: 'removed', message: 'Uzun süre bağlantın olmadığı için odadan çıkarıldın.' });
      this.send(m.session, { t: 'room', room: null });
    }
    if (room.game && !room.game.over) room.game.leave(pid);
    if (!room.humans().length) return this.close(room, 'empty');
    if (room.hostPid === pid) this.transferHost(room);
    this.event(room, { kind: 'left', nick: m.nick, bot: m.bot, reason });
    if (room.status === 'countdown' && room.members.length < 2) {
      clearTimeout(room.countdownTimer);
      room.status = 'lobby';
      room.startsAt = null;
    }
    room.touch();
    room.broadcast();
  }

  transferHost(room) {
    const byAge = (a, b) => a.joinedAt - b.joinedAt;
    const next = room.humans().filter((m) => m.online).sort(byAge)[0] || room.humans().sort(byAge)[0];
    if (!next || next.pid === room.hostPid) return;
    room.hostPid = next.pid;
    this.event(room, { kind: 'host', nick: next.nick, pid: next.pid });
  }

  close(room, reason) {
    if (room.status === 'closed') return;
    room.status = 'closed';
    clearTimeout(room.countdownTimer);
    room.stopBots();
    room.game?.dispose();
    for (const m of room.members) {
      clearTimeout(m.graceTimer);
      clearTimeout(m.hostTimer);
      if (m.session && m.session.roomCode === room.code) {
        m.session.roomCode = null;
        this.send(m.session, { t: 'event', kind: 'closed', reason });
        this.send(m.session, { t: 'room', room: null });
      }
    }
    this.rooms.delete(room.code);
    this.closed.set(room.code, Date.now());
  }

  /* ───────── host eylemleri */

  requireHost(session) {
    const room = this.mine(session);
    if (room.hostPid !== session.pid) throw new RoomError('not_host', 'Bunu yalnızca host yapabilir.');
    return room;
  }

  start(session) {
    const room = this.requireHost(session);
    if (room.status !== 'lobby' && room.status !== 'finished') throw new RoomError('bad_state', 'Maç zaten başladı.');
    if (room.members.length < 2) throw new RoomError('need_players', 'Maçı başlatmak için en az 2 oyuncu gerekli.');
    this.startCountdown(room);
  }

  addBot(session, level) {
    const room = this.requireHost(session);
    if (room.status !== 'lobby' && room.status !== 'finished') throw new RoomError('bad_state', 'Maç sürerken bot eklenemez.');
    if (room.members.length >= room.settings.capacity) throw new RoomError('full', 'Oda dolu.');
    const m = this.addBotMember(room, level);
    this.event(room, { kind: 'joined', nick: m.nick, pid: m.pid, bot: true, level: m.level });
    room.broadcast();
  }

  removeBot(session, pid) {
    const room = this.requireHost(session);
    const m = room.member(pid);
    if (!m || !m.bot) throw new RoomError('bad_target', 'Yalnızca botlar çıkarılabilir.');
    if (room.status !== 'lobby' && room.status !== 'finished') throw new RoomError('bad_state', 'Maç sürerken bot çıkarılamaz.');
    this.removeMember(room, pid, 'kicked');
  }

  /** Host maçtan önce (lobide ya da maç bitince) oda ayarlarını değiştirir. */
  updateSettings(session, patch = {}) {
    const room = this.requireHost(session);
    if (room.status !== 'lobby' && room.status !== 'finished') throw new RoomError('bad_state', 'Ayarlar maç sürerken değiştirilemez.');
    const next = normSettings({ ...room.settings, ...patch }, this.db);
    if (next.capacity < room.members.length) {
      throw new RoomError('bad_capacity', `Odada ${room.members.length} oyuncu var; kapasite bundan az olamaz.`);
    }
    room.settings = next;
    if (next.rounds !== room.series.total) room.series = { total: next.rounds, played: 0, wins: {} }; // seri baştan başlar
    room.touch();
    this.event(room, { kind: 'settings' });
    room.broadcast();
    return next;
  }

  /** Oyuncu kartı yalnızca maç bitince açılır (maç sırasında cevap ipucu olmasın). */
  card(session, fid) {
    const room = this.mine(session);
    if (!room.game?.over) throw new RoomError('bad_state', 'Oyuncu kartları maç bitince açılır.');
    const card = Number.isInteger(fid) ? this.db.card(fid) : null;
    if (!card) throw new RoomError('bad_target', 'Futbolcu bulunamadı.');
    return card;
  }

  startCountdown(room) {
    clearTimeout(room.countdownTimer);
    room.status = 'countdown';
    room.startsAt = Date.now() + COUNTDOWN_MS;
    room.countdownTimer = setTimeout(() => this.beginGame(room), COUNTDOWN_MS);
    room.touch();
    room.broadcast();
  }

  beginGame(room) {
    if (room.status !== 'countdown') return;
    if (room.members.length < 2) {
      room.status = 'lobby';
      room.startsAt = null;
      return room.broadcast();
    }
    room.stopBots();
    room.game?.dispose();
    const players = room.members.map((m) => ({ pid: m.pid, nick: m.nick, color: m.color, bot: m.bot, level: m.level }));
    const { size } = gameShape(room.settings.mode, players.length, room.settings.win);
    // Seçilen mod için ızgara çıkmazsa diğer modları dene; hiçbiri olmazsa sunucu çökmesin, oyuncular uyarılsın.
    let grid = null;
    for (const mode of [room.settings.mode, 'klasik', 'uzman']) {
      try {
        grid = makeGrid(this.db, mode, size, { avoid: room.avoidCats(), cats: room.settings.cats, off: room.settings.off });
        break;
      } catch {
        /* sıradaki modu dene */
      }
    }
    if (!grid) {
      room.status = room.round ? 'finished' : 'lobby';
      room.startsAt = null;
      const narrowed = room.settings.off.length || room.settings.cats.length < CAT_TYPES.length;
      this.event(room, {
        kind: 'error',
        message: narrowed
          ? 'Açık kriterler bu ızgarayı kurmaya yetmedi — ayarlardan biraz kriter geri aç.'
          : 'Bu oyuncu sayısı için ızgara üretilemedi, tekrar dene.',
      });
      return room.broadcast();
    }
    room.recentGrids.unshift([...grid.rows, ...grid.cols].map((c) => c.key));
    room.recentGrids.length = Math.min(room.recentGrids.length, RECENT_GRIDS);
    const st = room.settings;
    const game = new Game({
      db: this.db, mode: st.mode, turnTime: st.turnTime, win: st.win, style: st.style, matchTime: st.matchTime,
      hints: st.hints, reuse: st.reuse, players, grid,
    });
    room.game = game;
    room.round++;
    room.status = 'playing';
    room.startsAt = null;
    game.on('change', () => room.broadcast());
    game.on('log', (entry) => this.event(room, { kind: 'log', entry }));
    game.on('turn', (turn) => room.onTurn(turn));
    game.on('race', () => {
      room.raceBots = room.members.filter((m) => m.bot).map((m) => runRaceBot(game, m.pid));
    });
    game.on('end', (result) => {
      room.status = 'finished';
      // Turnuva: maçı kazanan seride bir puan alır (beraberlikte kimse almaz)
      room.series.played++;
      if (result?.winners?.length === 1) room.series.wins[result.winners[0]] = (room.series.wins[result.winners[0]] || 0) + 1;
      room.stopBots();
      room.touch();
    });
    for (const m of room.members) if (!m.online) game.setOnline(m.pid, false);
    game.start();
  }

  /* ───────── maç eylemleri */

  act(session, fn) {
    const room = this.mine(session);
    if (room.status !== 'playing' || !room.game || room.game.over) throw new RoomError('bad_state', 'Şu an oynanan bir maç yok.');
    const r = fn(room.game);
    if (!r.ok) throw new RoomError('rejected', r.error);
    room.touch();
    return r;
  }

  /* ───────── bağlantı */

  onDisconnect(session) {
    this.unwatch(session); // izleyiciyse listeden düş
    const room = this.roomOf(session);
    const m = room?.member(session.pid);
    if (!m) return;
    m.online = false;
    if (room.game && !room.game.over) room.game.setOnline(m.pid, false);
    clearTimeout(m.graceTimer);
    const grace = room.status === 'playing' || room.status === 'countdown' ? GAME_GRACE_MS : LOBBY_GRACE_MS;
    m.graceTimer = setTimeout(() => this.removeMember(room, m.pid, 'timeout'), grace);
    if (room.hostPid === m.pid) {
      clearTimeout(m.hostTimer);
      m.hostTimer = setTimeout(() => {
        const alt = room.humans().find((x) => x.online && x.pid !== m.pid);
        if (alt && room.hostPid === m.pid && !m.online) {
          room.hostPid = alt.pid;
          this.event(room, { kind: 'host', nick: alt.nick, pid: alt.pid });
          room.broadcast();
        }
      }, HOST_GRACE_MS);
    }
    room.broadcast();
  }

  onReconnect(session) {
    const room = this.roomOf(session);
    const m = room?.member(session.pid);
    if (!m) {
      session.roomCode = null;
      return null;
    }
    clearTimeout(m.graceTimer);
    clearTimeout(m.hostTimer);
    m.online = true;
    m.session = session;
    if (room.game && !room.game.over) room.game.setOnline(m.pid, true);
    room.broadcast();
    return room;
  }

  sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if ((room.status === 'lobby' || room.status === 'finished') && now - room.touchedAt > IDLE_ROOM_MS) this.close(room, 'idle');
    }
    for (const [code, at] of this.closed) if (now - at > TOMBSTONE_MS) this.closed.delete(code);
  }
}
