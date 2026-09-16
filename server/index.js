/* FOOTBALLGRID sunucusu — statik istemci + WebSocket (/ws).
   node server/index.js   (PORT, HOST, PUBLIC_URL, TRUST_PROXY ortam değişkenleri isteğe bağlı) */

import http from 'node:http';
import os from 'node:os';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

import { FootballDB } from './db.js';
import { Sessions } from './sessions.js';
import { RoomManager, RoomError } from './rooms.js';
import { Matchmaker } from './matchmaking.js';
import { validateNick } from './nickname.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '..', 'public');
const DB_FILE = join(HERE, 'data', 'db.json');
const VERSION = 1;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Aynı Wi-Fi'deki telefonların ulaşabileceği IPv4 adresi (sanal/VPN bağdaştırıcıları geride). */
export function lanAddress() {
  const all = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })),
  );
  const score = (a) =>
    (/^192\.168\./.test(a.address) ? 3 : /^10\./.test(a.address) ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 1 : 0) -
    (/vethernet|virtual|vmware|vbox|hyper-v|wsl|tap|tun|vpn|loopback|docker/i.test(a.name) ? 5 : 0);
  return all.sort((a, b) => score(b) - score(a))[0]?.address || null;
}

const toInt = (x) => (Number.isInteger(x) ? x : null);

export function createApp({
  dbFile = DB_FILE,
  publicUrl = process.env.PUBLIC_URL || null,
  joinLimit = 20, // IP başına dakikada oda katılma/sorgulama (kod tahminine karşı)
  maxConnPerIp = 40,
} = {}) {
  const db = new FootballDB(dbFile);
  const sessions = new Sessions();
  const state = { publicUrl, port: null };

  const sendWs = (ws, msg) => {
    if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  };
  const send = (session, msg) => sendWs(session?.ws, msg);

  let mm = null;
  const rooms = new RoomManager({ db, send, onEnter: (s) => mm?.leave(s) });
  mm = new Matchmaker({ rooms, send });

  /* ───────── HTTP */

  function serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, SECURITY);
      return res.end();
    }
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400, SECURITY);
      return res.end();
    }
    if (path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY });
      return res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size, sessions: sessions.size, waiting: mm.total(), players: db.players.length }));
    }
    if (path === '/' || /^\/oda\/[A-Za-z0-9ıİ]{1,8}\/?$/.test(path)) path = '/index.html';
    const file = resolve(PUBLIC, '.' + path);
    if (!file.startsWith(PUBLIC + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY });
      return res.end('Bulunamadı');
    }
    const ext = extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.woff2' ? 'public, max-age=604800, immutable' : 'no-cache',
      ...SECURITY,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  }

  const server = http.createServer(serveStatic);

  function publicUrlFor(req) {
    if (state.publicUrl) return state.publicUrl.replace(/\/$/, '');
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host)) {
      const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' ? 'https' : 'http';
      return `${proto}://${host}`;
    }
    const ip = lanAddress();
    return ip ? `http://${ip}:${state.port}` : `http://${host}`;
  }

  function clientIp(req) {
    const remote = req.socket.remoteAddress || '?';
    const loop = /^(::1|127\.|::ffff:127\.)/.test(remote);
    const fwd = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return (loop || process.env.TRUST_PROXY) && fwd ? fwd : remote;
  }

  /* ───────── kötüye kullanım sınırları */

  const joinHits = new Map(); // ip → zaman damgaları (oda kodu tahminine karşı)
  function limitJoin(ip) {
    const now = Date.now();
    const arr = (joinHits.get(ip) || []).filter((t) => now - t < 60_000);
    if (arr.length >= joinLimit) {
      joinHits.set(ip, arr);
      throw new RoomError('rate', 'Çok fazla deneme yaptın, bir dakika sonra tekrar dene.');
    }
    arr.push(now);
    joinHits.set(ip, arr);
  }
  const connsPerIp = new Map();

  function takeToken(ws) {
    const now = Date.now();
    const b = ws.bucket;
    b.tokens = Math.min(40, b.tokens + ((now - b.at) / 1000) * 20);
    b.at = now;
    if (b.tokens < 1) {
      if (++b.strikes > 60) ws.close(4008, 'rate');
      return false;
    }
    b.tokens -= 1;
    return true;
  }

  /* ───────── WebSocket protokolü */

  function hello(ws, m, ctx) {
    if (ws.session) return { pid: ws.session.pid, serverTime: Date.now() };
    let s = sessions.verify(m.playerId, m.token);
    let token = null;
    const resumed = !!s;
    if (!s) ({ session: s, token } = sessions.create());
    if (s.ws && s.ws !== ws) {
      // Aynı oyuncu başka sekmede açtı: eski sekme koltuğu bırakır.
      const old = s.ws;
      sendWs(old, { t: 'replaced' });
      old.session = null;
      old.close(4001, 'replaced');
    }
    s.ws = ws;
    ws.session = s;
    s.lastSeen = Date.now();
    const elo = Number(m.elo);
    if (Number.isFinite(elo)) s.elo = Math.max(100, Math.min(4000, Math.round(elo)));
    const room = resumed ? rooms.onReconnect(s) : null;
    const queue = resumed ? mm.onReconnect(s) : null;
    return {
      playerId: s.playerId,
      token,
      pid: s.pid,
      resumed,
      serverTime: Date.now(),
      publicUrl: ctx.publicUrl,
      room: room ? rooms.snapshot(room) : null,
      queue,
      version: VERSION,
      db: { players: db.players.length, builtAt: db.builtAt },
    };
  }

  const handlers = {
    'nick/check': (s, m) => {
      const v = validateNick(m.nick);
      if (!v.ok) throw new RoomError('invalid_nick', v.error);
      return { nick: v.nick };
    },
    'room/create': (s, m) => ({ code: rooms.create(s, m).code }),
    'room/peek': (s, m, ctx) => {
      limitJoin(ctx.ip);
      return rooms.peek(m.code);
    },
    'room/join': (s, m, ctx) => {
      limitJoin(ctx.ip);
      return { code: rooms.join(s, m.code, m.nick).code };
    },
    'room/leave': (s) => void rooms.leave(s),
    'room/watch': (s, m, ctx) => {
      limitJoin(ctx.ip);
      return { code: rooms.watch(s, m.code).code };
    },
    'room/unwatch': (s) => void rooms.unwatch(s),
    'room/start': (s) => void rooms.start(s),
    'room/addBot': (s, m) => void rooms.addBot(s, String(m.level ?? '')),
    'room/removeBot': (s, m) => void rooms.removeBot(s, String(m.pid ?? '')),
    'room/settings': (s, m) => ({ settings: rooms.updateSettings(s, m.settings && typeof m.settings === 'object' ? m.settings : {}) }),
    'game/hint': (s, m) => ({ hint: rooms.act(s, (g) => g.hint(s.pid, toInt(m.cell))).hint }),
    'player/card': (s, m) => ({ card: rooms.card(s, toInt(m.fid)) }),
    'queue/join': (s, m) => ({ queue: mm.join(s, m.size, m.nick) }),
    'queue/leave': (s) => void mm.leave(s),
    'queue/bots': (s, m) => void mm.withBots(s, String(m.level ?? '')),
    'queue/counts': () => ({ counts: mm.counts(), waiting: mm.total() }),
    'game/select': (s, m) => void rooms.act(s, (g) => g.select(s.pid, m.cell === null ? null : toInt(m.cell))),
    'game/answer': (s, m) => {
      const r = rooms.act(s, (g) => g.answer(s.pid, toInt(m.cell), toInt(m.fid)));
      return { correct: r.correct, reasons: r.reasons || [] };
    },
    'game/pass': (s) => void rooms.act(s, (g) => g.pass(s.pid)),
    search: (s, m) => ({ q: String(m.q ?? '').slice(0, 48), items: db.search(String(m.q ?? '')) }),
    ping: () => ({ now: Date.now() }),
  };

  function handle(ws, msg, ctx) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    const { t, rid } = msg;
    const reply = (ok, payload) => {
      if (rid === undefined || rid === null) return;
      sendWs(ws, ok ? { t: 'res', rid, ok: true, data: payload ?? {} } : { t: 'res', rid, ok: false, error: payload });
    };
    try {
      if (t === 'hello') return reply(true, hello(ws, msg, ctx));
      const s = ws.session;
      if (!s) throw new RoomError('no_session', 'Bağlantı henüz hazır değil.');
      const h = Object.hasOwn(handlers, t) ? handlers[t] : null;
      if (!h) throw new RoomError('unknown', 'Bilinmeyen istek.');
      s.lastSeen = Date.now();
      reply(true, h(s, msg, ctx));
    } catch (e) {
      if (e instanceof RoomError) {
        reply(false, { code: e.code, message: e.message, ...(e.suggestion ? { suggestion: e.suggestion } : {}) });
      } else {
        console.error('[sunucu hatası]', t, e);
        reply(false, { code: 'server', message: 'Sunucuda bir hata oluştu.' });
      }
    }
  }

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const n = (connsPerIp.get(ip) || 0) + 1;
    if (n > maxConnPerIp) return ws.close(4029, 'too many connections');
    connsPerIp.set(ip, n);
    const ctx = { ip, publicUrl: publicUrlFor(req) };
    ws.isAlive = true;
    ws.bucket = { tokens: 40, at: Date.now(), strikes: 0 };
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data, isBinary) => {
      if (isBinary || !takeToken(ws)) return;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      handle(ws, msg, ctx);
    });
    ws.on('close', () => {
      const left = (connsPerIp.get(ip) || 1) - 1;
      if (left > 0) connsPerIp.set(ip, left);
      else connsPerIp.delete(ip);
      const s = ws.session;
      ws.session = null;
      if (s && s.ws === ws) {
        s.ws = null;
        s.lastSeen = Date.now();
        rooms.onDisconnect(s);
        mm.onDisconnect(s);
      }
    });
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25_000);
  const sweeper = setInterval(() => {
    sessions.sweep();
    rooms.sweep();
    const now = Date.now();
    for (const [ip, arr] of joinHits) if (!arr.some((t) => now - t < 60_000)) joinHits.delete(ip);
  }, 60_000);
  heartbeat.unref();
  sweeper.unref();

  return {
    db,
    rooms,
    mm,
    sessions,
    state,
    server,
    listen(port, host = '0.0.0.0') {
      return new Promise((ok, fail) => {
        server.once('error', fail);
        server.listen(port, host, () => {
          state.port = server.address().port;
          ok(state.port);
        });
      });
    },
    setPublicUrl(url) {
      state.publicUrl = url;
    },
    close() {
      clearInterval(heartbeat);
      clearInterval(sweeper);
      mm.dispose();
      for (const room of [...rooms.rooms.values()]) rooms.close(room, 'shutdown');
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      return new Promise((ok) => server.close(() => ok()));
    },
  };
}

export async function startFromCli() {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  await app.listen(port, process.env.HOST || '0.0.0.0');
  const ip = lanAddress();
  console.log(`\n  FOOTBALLGRID hazır · ${app.db.players.length.toLocaleString('tr-TR')} futbolcu`);
  console.log(`  Bu bilgisayarda : http://localhost:${port}`);
  if (ip) console.log(`  Aynı Wi-Fi'de   : http://${ip}:${port}`);
  if (app.state.publicUrl) console.log(`  Herkese açık    : ${app.state.publicUrl}`);
  console.log('');
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startFromCli().catch((e) => {
    if (e.code === 'ENOENT' && String(e.path || '').endsWith('db.json')) {
      console.error('server/data/db.json yok. Önce: npm run data:resolve && npm run data:build');
    } else if (e.code === 'EADDRINUSE') {
      console.error(`Port kullanımda. Başka bir port dene: PORT=3001 npm start`);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
}
