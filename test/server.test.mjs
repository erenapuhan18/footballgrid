import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { writeFixtureDb, connect, sleep } from './helpers.mjs';

let app;
let port;
const open = [];
const client = async (hello) => {
  const c = await connect(port, hello);
  open.push(c);
  return c;
};

before(async () => {
  app = createApp({ dbFile: writeFixtureDb(11), joinLimit: 10_000, maxConnPerIp: 500 });
  port = await app.listen(0, '127.0.0.1');
});
after(async () => {
  for (const c of open) c.close();
  await app.close();
});

test('kimlik: yeni oturum, aynı jetonla devam, yanlış jetonla yeni kimlik', async () => {
  const a = await client();
  assert.match(a.hello.playerId, /^[0-9a-f-]{36}$/);
  assert.ok(a.hello.token.length >= 30);
  assert.ok(a.hello.pid && a.hello.pid !== a.hello.playerId);
  a.close();
  await sleep(50);
  const b = await client({ playerId: a.hello.playerId, token: a.hello.token });
  assert.equal(b.hello.resumed, true);
  assert.equal(b.hello.pid, a.hello.pid);
  assert.equal(b.hello.token, null, 'jeton bir daha gönderilmez');
  const c = await client({ playerId: a.hello.playerId, token: 'yanlis-jeton' });
  assert.equal(c.hello.resumed, false);
  assert.notEqual(c.hello.pid, a.hello.pid);
});

test('oda: oluştur, küçük harfli kodla katıl, aynı ad önerisi, dolu/bulunamadı/kapatıldı, host devri', async () => {
  const host = await client();
  const { code } = await host.req('room/create', { nick: 'Eren', capacity: 3, mode: 'klasik', turnTime: 30 });
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  const r1 = await host.room((r) => r.code === code);
  assert.equal(r1.hostPid, host.hello.pid);
  assert.deepEqual(r1.settings, { capacity: 3, mode: 'klasik', turnTime: 30, win: 'line3', style: 'turn', matchTime: 180, rounds: 1, hints: true, reuse: false });

  const p2 = await client();
  await assert.rejects(p2.req('room/join', { code: code.toLowerCase(), nick: 'EREN' }), (e) => {
    assert.equal(e.code, 'nick_taken');
    assert.equal(e.message, '"EREN" zaten kullanılıyor.');
    assert.equal(e.suggestion, 'EREN123');
    return true;
  });
  await p2.req('room/join', { code: code.toLowerCase(), nick: 'Ahmet' });
  await host.room((r) => r.members.length === 2);

  // aynı oyuncu ikinci koltuk alamaz
  await p2.req('room/join', { code, nick: 'Ahmet' });
  assert.equal((await p2.req('room/peek', { code })).count, 2);

  const p3 = await client();
  await p3.req('room/join', { code, nick: 'Mehmet' });
  const p4 = await client();
  await assert.rejects(p4.req('room/join', { code, nick: 'Ali' }), (e) => e.code === 'full' && e.message === 'Bu oda dolu.');
  await assert.rejects(p4.req('room/join', { code: 'ZZZZZ', nick: 'Ali' }), (e) => e.code === 'not_found' && e.message === 'Bu oda bulunamadı.');

  await host.req('room/leave');
  const ev = await p2.wait((m) => m.t === 'event' && m.kind === 'host');
  assert.equal(ev.nick, 'Ahmet');
  assert.equal((await p2.room((r) => r.members.length === 2)).hostPid, p2.hello.pid);

  await p2.req('room/leave');
  await p3.req('room/leave');
  await assert.rejects(p4.req('room/join', { code, nick: 'Ali' }), (e) => e.code === 'closed' && e.message === 'Bu oda kapatıldı.');
});

test('maç: başladıktan sonra katılınamaz; sıra, doğru/yanlış cevap, pas', async () => {
  const a = await client();
  const b = await client();
  const { code } = await a.req('room/create', { nick: 'Kerem', capacity: 3, mode: 'klasik', turnTime: 30 });
  await b.req('room/join', { code, nick: 'Deniz' });
  await assert.rejects(b.req('room/start'), (e) => e.code === 'not_host');
  await a.req('room/start');
  await a.room((r) => r.status === 'countdown');
  const c = await client();
  await assert.rejects(c.req('room/join', { code, nick: 'Selin' }), (e) => e.code === 'started' && e.message === 'Bu maç zaten başladı.');

  const r = await a.room((x) => x.status === 'playing', 6000);
  assert.equal(r.game.size, 3);
  assert.equal(r.game.rows.length, 3);
  const turnPid = r.game.turn.pid;
  const cur = turnPid === a.hello.pid ? a : b;
  const other = cur === a ? b : a;
  const game = app.rooms.rooms.get(code).game;

  await assert.rejects(other.req('game/answer', { cell: 0, fid: 0 }), (e) => e.message === 'Sıra sende değil.');
  await cur.req('game/select', { cell: 0 });
  assert.equal((await other.room((x) => x.game?.turn?.selected === 0)).game.turn.pid, turnPid);

  const [row, col] = game.catsOf(0);
  const ans = app.db.answers(row, col, 1)[0];
  assert.equal((await cur.req('game/answer', { cell: 0, fid: ans.i })).correct, true);
  const r2 = await other.room((x) => x.game?.cells[0].owner === turnPid);
  assert.equal(r2.game.cells[0].name, ans.name);
  assert.notEqual(r2.game.turn.pid, turnPid);

  await assert.rejects(other.req('game/answer', { cell: 1, fid: ans.i }), (e) => /zaten kullanıldı/.test(e.message));
  const [row1] = game.catsOf(1);
  const wrong = app.db.players.find((p) => !app.db.matches(p, row1) && !game.used.has(p.i));
  const w = await other.req('game/answer', { cell: 1, fid: wrong.i });
  assert.equal(w.correct, false);
  // Gerekçe satır türüne göre değişir (kulüpte oynamadı / uyruklu değil / kupayı kazanmadı …)
  assert.ok(w.reasons.length >= 1 && w.reasons[0].length > 3, w.reasons.join(' · '));
  await cur.req('game/pass');
  const log = await a.wait((m) => m.t === 'event' && m.kind === 'log' && m.entry.kind === 'pass');
  assert.equal(log.entry.pid, turnPid);

  const s = await a.req('search', { q: 'yilmaz' });
  assert.ok(s.items.length > 0 && s.items.length <= 8);
});

test('yeniden bağlanma: oturum odasına döner; ikinci sekme eskisini devralır', async () => {
  const a = await client();
  const { code } = await a.req('room/create', { nick: 'Tuna', capacity: 2 });
  await a.room();
  const creds = { playerId: a.hello.playerId, token: a.hello.token };
  a.close();
  await sleep(80);
  const a2 = await client(creds);
  assert.equal(a2.hello.room.code, code);
  assert.equal(a2.hello.room.members[0].online, true);
  await client(creds);
  await a2.wait((m) => m.t === 'replaced');
  await sleep(50);
  assert.equal(a2.closed, 4001);
});

test('eşleştirme: iki kişi buluşur, oda kendiliğinden kurulur, aynı ad otomatik ayrışır', async () => {
  const a = await client();
  const b = await client();
  const qa = await a.req('queue/join', { size: 2, nick: 'Arda' });
  assert.equal(qa.queue.size, 2);
  assert.ok(qa.queue.waiting >= 1);
  assert.equal(qa.queue.nick, 'Arda');
  const qb = await b.req('queue/join', { size: 2, nick: 'arda' });
  assert.equal(qb.queue, null, 'hemen eşleşti');
  const room = await a.room((r) => r.status === 'countdown');
  assert.equal(room.quick, true);
  assert.equal(room.members.length, 2);
  const ev = await b.wait((m) => m.t === 'event' && m.kind === 'renamed');
  assert.equal(ev.nick, 'arda2');
  await a.room((r) => r.status === 'playing', 6000);
});

test('eşleştirme: bekleme süresi dolunca botlarla başlar, botlar oynar', async () => {
  const a = await client();
  await a.req('queue/join', { size: 3, nick: 'Yalnız' });
  await assert.rejects(a.req('queue/bots'), (e) => e.code === 'too_soon');
  app.sessions.byPublic(a.hello.pid).queue.since -= 60_000;
  await a.req('queue/bots', { level: 'zor' });
  const r = await a.room((x) => x.status === 'countdown');
  assert.equal(r.members.filter((m) => m.bot).length, 2);
  assert.ok(r.members.filter((m) => m.bot).every((m) => m.level === 'zor'), 'seçilen bot seviyesi botlara geçer');
  const playing = await a.room((x) => x.status === 'playing', 6000);
  assert.equal(playing.game.size, 4);
  // Sıra bir bottaysa bot kendi hamlesini yapar; sıra bizdeyse pas geçip botu bekleriz.
  if (playing.game.turn.pid === a.hello.pid) await a.req('game/pass');
  const botMove = await a.wait((m) => m.t === 'event' && m.kind === 'log' && m.entry.pid.startsWith('bot_'), 12_000);
  assert.ok(['correct', 'wrong', 'pass', 'steal'].includes(botMove.entry.kind));
});

test("kazanma şekli: 3 kişide varsayılan 3'leme, 4 kişide en çok hücre, seçim korunur", async () => {
  const a = await client();
  await a.req('room/create', { nick: 'Üçlü', capacity: 3 });
  assert.equal((await a.room((r) => r.settings.capacity === 3)).settings.win, 'line3');
  await a.req('room/create', { nick: 'Dörtlü', capacity: 4 });
  assert.equal((await a.room((r) => r.settings.capacity === 4)).settings.win, 'most');
  await a.req('room/create', { nick: 'Seçen', capacity: 4, win: 'line3' });
  assert.equal((await a.room((r) => r.members[0]?.nick === 'Seçen')).settings.win, 'line3');
});

test('ayarlar: host lobide değiştirir; ipucu ve oyuncu kartı uçları', async () => {
  const a = await client();
  const b = await client();
  const { code } = await a.req('room/create', { nick: 'Ayarcı', capacity: 2, style: 'race', matchTime: 60, hints: true, reuse: true });
  let r = await a.room((x) => x.code === code);
  assert.equal(r.settings.style, 'race');
  assert.equal(r.settings.matchTime, 60);
  assert.equal(r.settings.reuse, true);
  await b.req('room/join', { code, nick: 'Konuk' });
  await assert.rejects(b.req('room/settings', { settings: { mode: 'uzman' } }), (e) => e.code === 'not_host');
  await a.req('room/settings', { settings: { mode: 'hizli', style: 'turn', hints: false } });
  r = await b.room((x) => x.settings.mode === 'hizli');
  assert.equal(r.settings.hints, false);
  assert.equal(r.settings.style, 'turn');
  await b.wait((m) => m.t === 'event' && m.kind === 'settings');
  await assert.rejects(a.req('player/card', { fid: 0 }), (e) => e.code === 'bad_state', 'kart maç bitmeden açılmaz');

  await a.req('room/settings', { settings: { hints: true } });
  await a.req('room/start');
  const playing = await a.room((x) => x.status === 'playing', 6000);
  const cur = playing.game.turn.pid === a.hello.pid ? a : b;
  const hint = await cur.req('game/hint', { cell: 0 });
  assert.ok(Array.isArray(hint.hint.nats) && Array.isArray(hint.hint.pos));
  // /i bayrağı Türkçe İ'yi i ile eşlemez → düz metin
  await assert.rejects(cur.req('game/hint', { cell: 1 }), (e) => e.message.includes('hakkını'));

  app.rooms.rooms.get(code).game.end('turns');
  await a.room((x) => x.status === 'finished');
  const { card } = await a.req('player/card', { fid: 0 });
  assert.equal(card.id, 0);
  assert.ok(card.name && Array.isArray(card.clubs));
});

test('izleyici: dolu odayı izler, oynayamaz, çıkınca listeden düşer', async () => {
  const a = await client();
  const b = await client();
  const { code } = await a.req('room/create', { nick: 'Sahip', capacity: 2 });
  await b.req('room/join', { code, nick: 'Rakip' });
  const c = await client();
  await assert.rejects(c.req('room/join', { code, nick: 'Geciken' }), (e) => e.code === 'full');
  await c.req('room/watch', { code });
  const r = await c.room((x) => x.code === code);
  assert.equal(r.watchers, 1, 'izleyici sayısı');
  assert.equal(r.members.length, 2, 'izleyici oyuncu olmaz');
  await assert.rejects(c.req('game/select', { cell: 0 }), (e) => e.code === 'no_room');
  await c.req('room/unwatch');
  assert.equal((await a.room((x) => x.watchers === 0)).watchers, 0);
});

test('takma ad kuralları sunucuda da uygulanır', async () => {
  const a = await client();
  await assert.rejects(a.req('room/create', { nick: 'ab' }), (e) => e.code === 'invalid_nick');
  await assert.rejects(a.req('room/create', { nick: 'amk' }), (e) => e.code === 'invalid_nick');
  await assert.rejects(a.req('queue/join', { size: 2, nick: '12345' }), (e) => e.code === 'invalid_nick');
  assert.equal((await a.req('nick/check', { nick: '  Şahin ' })).nick, 'Şahin');
});

test('HTTP: statik dosya, oda yolu, güvenlik başlıkları, klasör dışına çıkış yok', async () => {
  const base = `http://127.0.0.1:${port}`;
  const r1 = await fetch(base + '/');
  assert.equal(r1.status, 200);
  assert.match(r1.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r1.headers.get('x-content-type-options'), 'nosniff');
  const r2 = await fetch(base + '/oda/7k4p9');
  assert.equal(r2.status, 200);
  assert.match(await r2.text(), /FOOTBALLGRID/);
  const status = await new Promise((ok) =>
    http.get({ host: '127.0.0.1', port, path: '/%2e%2e%2fserver%2findex.js' }, (res) => ok(res.statusCode)),
  );
  assert.equal(status, 404);
  assert.equal((await (await fetch(base + '/healthz')).json()).ok, true);
});
