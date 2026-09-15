/* WebSocket istemcisi: kimlikle "hello", istek/yanıt (rid), otomatik yeniden bağlanma. */

export class Net {
  constructor({ getHello, onCreds }) {
    this.getHello = getHello;
    this.onCreds = onCreds;
    this.url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.ws = null;
    this.ready = false;
    this.rid = 0;
    this.pending = new Map();
    this.waiting = []; // bağlantı hazır olmadan gelen istekler
    this.listeners = new Map();
    this.backoff = 400;
    this.offset = 0; // sunucu saati − yerel saat
    this.stopped = false;
  }

  on(type, fn) {
    (this.listeners.get(type) || this.listeners.set(type, new Set()).get(type)).add(fn);
    return () => this.listeners.get(type).delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners.get(type) || []) fn(data);
  }

  now() {
    return Date.now() + this.offset;
  }

  connect() {
    this.stopped = false;
    clearTimeout(this.retryTimer);
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.backoff = 400;
      const rid = ++this.rid;
      const sentAt = Date.now();
      this.pending.set(rid, {
        resolve: (data) => {
          const rtt = Date.now() - sentAt;
          this.offset = data.serverTime + rtt / 2 - Date.now();
          if (data.token) this.onCreds({ playerId: data.playerId, token: data.token });
          this.ready = true;
          this.emit('status', 'online');
          this.emit('welcome', data);
          const q = this.waiting.splice(0);
          for (const w of q) this.flush(w);
        },
        reject: () => ws.close(),
      });
      ws.send(JSON.stringify({ t: 'hello', rid, ...this.getHello() }));
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'res') {
        const p = this.pending.get(msg.rid);
        if (!p) return;
        this.pending.delete(msg.rid);
        clearTimeout(p.timer);
        msg.ok ? p.resolve(msg.data) : p.reject(msg.error);
        return;
      }
      this.emit(msg.t, msg);
    });
    ws.addEventListener('close', (ev) => {
      if (this.ws !== ws) return;
      this.ready = false;
      for (const [rid, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject({ code: 'offline', message: 'Bağlantı koptu.' });
        this.pending.delete(rid);
      }
      if (ev.code === 4001) {
        this.stopped = true;
        this.emit('status', 'replaced');
        return;
      }
      this.emit('status', 'offline');
      if (this.stopped) return;
      this.retryTimer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.8, 5000);
    });
  }

  /** Sayfa arka plandan dönünce bağlantı ölmüşse hemen yeniden dene. */
  poke() {
    if (!this.stopped && (!this.ws || this.ws.readyState > 1)) this.connect();
  }

  flush(w) {
    const rid = ++this.rid;
    w.timer = setTimeout(() => {
      if (this.pending.delete(rid)) w.reject({ code: 'timeout', message: 'Sunucu yanıt vermedi.' });
    }, w.timeout);
    this.pending.set(rid, w);
    this.ws.send(JSON.stringify({ ...w.data, t: w.t, rid }));
  }

  request(t, data = {}, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const w = { t, data, timeout, resolve, reject };
      if (this.ready && this.ws?.readyState === 1) this.flush(w);
      else this.waiting.push(w);
    });
  }
}
