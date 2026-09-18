/* Hızlı maç eşleştirmesi: 2 / 3 / 4 kişilik kuyruklar, geçici playerId + takma adla.
   Kuyruk dolunca oda kendiliğinden kurulur ve geri sayım başlar.
   45 sn içinde yeterli rakip çıkmazsa oyuncuya "botlarla başla" seçeneği sunulur;
   o anda kuyrukta bekleyen başka insanlar varsa önce onlar alınır. */

import { validateNick } from './nickname.js';
import { RoomError } from './rooms.js';

export const BOT_OFFER_MS = 45_000;
// Telefon uyuyunca / ağ değişinca bağlantı kopuyor; 15 sn çok kısaydı, oyuncu kuyruktan düşüyordu
const OFFLINE_DROP_MS = 90_000;
const SIZES = [2, 3, 4];

export class Matchmaker {
  constructor({ rooms, send }) {
    this.rooms = rooms;
    this.send = send;
    this.queues = { 2: [], 3: [], 4: [] };
    this.avgWait = { 2: null, 3: null, 4: null }; // üstel ortalama, ms
    this.timer = setInterval(() => this.tick(), 2000);
    this.timer.unref?.();
  }

  counts() {
    return Object.fromEntries(SIZES.map((s) => [s, this.online(s)]));
  }

  total() {
    return SIZES.reduce((n, s) => n + this.queues[s].length, 0);
  }

  /** Bağlantısı kopuk bekleyenler sayılmaz: ekranda "1 kişi bekliyor" yazıp kimse çıkmamasın. */
  online(size) {
    return this.queues[size].filter((e) => !e.offlineSince).length;
  }

  status(entry) {
    const avg = this.avgWait[entry.size];
    return {
      size: entry.size,
      nick: entry.nick,
      since: entry.since,
      waiting: SIZES.reduce((n, s) => n + this.online(s), 0),
      waitingSize: this.online(entry.size),
      avgWaitSec: avg == null ? null : Math.max(1, Math.round(avg / 1000)),
      botsAt: entry.since + BOT_OFFER_MS,
    };
  }

  join(session, size, rawNick) {
    size = Number(size);
    if (!SIZES.includes(size)) throw new RoomError('bad_size', 'Oyuncu sayısı 2, 3 ya da 4 olmalı.');
    const v = validateNick(rawNick);
    if (!v.ok) throw new RoomError('invalid_nick', v.error);
    this.remove(session);
    if (session.roomCode) this.rooms.leave(session, 'switched');
    const entry = { session, nick: v.nick, size, since: Date.now(), offlineSince: null };
    session.queue = entry;
    session.nick = v.nick;
    this.queues[size].push(entry);
    this.tryMatch(size);
    this.broadcast();
    return session.queue ? this.status(entry) : null;
  }

  remove(session) {
    const e = session.queue;
    if (!e) return false;
    const q = this.queues[e.size];
    const i = q.indexOf(e);
    if (i >= 0) q.splice(i, 1);
    session.queue = null;
    return true;
  }

  leave(session) {
    if (this.remove(session)) this.broadcast();
  }

  tryMatch(size) {
    const q = this.queues[size];
    for (;;) {
      const ready = q.filter((e) => !e.offlineSince);
      if (ready.length < size) return;
      this.form(ready.slice(0, size), 0);
    }
  }

  form(group, bots, level) {
    const now = Date.now();
    for (const e of group) {
      const q = this.queues[e.size];
      q.splice(q.indexOf(e), 1);
      e.session.queue = null;
      const w = now - e.since;
      const prev = this.avgWait[e.size];
      this.avgWait[e.size] = prev == null ? w : prev * 0.7 + w * 0.3;
    }
    const size = group[0].size;
    this.rooms.createQuick(group.map((e) => ({ session: e.session, nick: e.nick })), bots, size, level);
  }

  withBots(session, level) {
    const e = session.queue;
    if (!e) throw new RoomError('no_queue', 'Şu an rakip aramıyorsun.');
    if (Date.now() - e.since < BOT_OFFER_MS - 500) throw new RoomError('too_soon', 'Biraz daha bekle, rakip aranıyor.');
    const others = this.queues[e.size].filter((x) => x !== e && !x.offlineSince);
    const group = [e, ...others].slice(0, e.size);
    this.form(group, e.size - group.length, level);
    this.broadcast();
  }

  onDisconnect(session) {
    if (session.queue) session.queue.offlineSince = Date.now();
  }

  onReconnect(session) {
    const e = session.queue;
    if (!e) return null;
    e.offlineSince = null;
    this.tryMatch(e.size);
    return session.queue ? this.status(e) : null;
  }

  broadcast() {
    for (const s of SIZES) {
      for (const e of this.queues[s]) this.send(e.session, { t: 'queue', queue: this.status(e) });
    }
  }

  tick() {
    const now = Date.now();
    let changed = false;
    for (const s of SIZES) {
      for (const e of [...this.queues[s]]) {
        if (e.offlineSince && now - e.offlineSince > OFFLINE_DROP_MS) {
          this.remove(e.session);
          changed = true;
        }
      }
    }
    if (changed || this.total()) this.broadcast();
  }

  dispose() {
    clearInterval(this.timer);
  }
}
