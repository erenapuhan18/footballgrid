/* Hesapsız kimlik. Sunucu her tarayıcıya geçici bir playerId (uuid) ve gizli bir jeton verir.
   İstemci ikisini localStorage'da tutar; yeniden bağlanırken ikisini birlikte gönderir.
   Sunucu jetonun yalnızca SHA-256 özetini saklar ve sabit zamanlı karşılaştırır.

   pid: odadaki diğer oyunculara gösterilen herkese açık kısa kimlik — playerId asla yayınlanmaz.

   İleride hesap sistemine geçilirse: Session'a accountId eklenir, playerId ↔ hesap
   eşlemesi burada yapılır; oda/maç kodu yalnızca pid'i bildiği için değişmez. */

import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest();

export class Sessions {
  constructor({ ttlMs = 12 * 3600e3, max = 20000 } = {}) {
    this.byId = new Map();
    this.byPid = new Map();
    this.ttlMs = ttlMs;
    this.max = max;
  }

  create() {
    if (this.byId.size >= this.max) this.sweep(60e3);
    const token = randomBytes(24).toString('base64url');
    const s = {
      playerId: randomUUID(),
      pid: randomBytes(6).toString('base64url'),
      tokenHash: sha(token),
      ws: null,
      nick: null,
      elo: 1000,
      roomCode: null,
      queue: null,
      lastSeen: Date.now(),
    };
    this.byId.set(s.playerId, s);
    this.byPid.set(s.pid, s);
    return { session: s, token };
  }

  verify(playerId, token) {
    if (typeof playerId !== 'string' || typeof token !== 'string') return null;
    if (playerId.length > 64 || token.length > 128) return null;
    const s = this.byId.get(playerId);
    if (!s) return null;
    return timingSafeEqual(sha(token), s.tokenHash) ? s : null;
  }

  byPublic(pid) {
    return this.byPid.get(pid) || null;
  }

  /** Bağlı olmayan, odası/kuyruğu olmayan ve uzun süredir görülmeyen oturumları sil. */
  sweep(idleMs = this.ttlMs) {
    const now = Date.now();
    for (const s of this.byId.values()) {
      if (!s.ws && !s.roomCode && !s.queue && now - s.lastSeen > idleMs) {
        this.byId.delete(s.playerId);
        this.byPid.delete(s.pid);
      }
    }
  }

  get size() {
    return this.byId.size;
  }
}
