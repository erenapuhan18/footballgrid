/* Test yardımcıları: Wikidata'ya bağlı olmayan, tohumlu sentetik veritabanı + WebSocket istemcisi. */

import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIRST = ['Ali', 'Arda', 'Burak', 'Can', 'Emre', 'Hakan', 'Kerem', 'Mert', 'Onur', 'Selçuk', 'Tolga', 'Umut', 'Volkan', 'Yusuf', 'Zeki', 'Diego', 'Marco', 'Luis', 'Pierre', 'Hans'];
export const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Kılıç', 'Rossi', 'Silva', 'Müller', 'Dubois', 'García', 'Smith', 'Novak', 'Ivanov', 'Costa', 'Jensen'];

/** 8 kulüp, 5 ülke, 2 lig, 4 mevki; ~900 futbolcu, her biri 3 kulüpte oynamış. */
export function makeFixtureDb(seed = 7) {
  const rng = mulberry32(seed);
  const clubs = [
    ['aas', 'Aslanspor', 'ASL', 'tr', 'l1', 'k'], ['kan', 'Kanaryaspor', 'KAN', 'tr', 'l1', 'k'],
    ['kar', 'Kartalspor', 'KAR', 'tr', 'l1', 'k'], ['rea', 'Real Örnek', 'REA', 'es', 'l2', 'k'],
    ['bar', 'Barça Örnek', 'BAR', 'es', 'l2', 'k'], ['juv', 'Juve Örnek', 'JUV', 'it', 'l2', 'k'],
    ['bay', 'Bayern Örnek', 'BAY', 'de', 'l2', 'u'], ['psg', 'Paris Örnek', 'PSG', 'fr', 'l2', 'u'],
  ].map(([key, name, short, nation, league, tier], i) => ({ key, qid: 'QC' + i, name, short, colors: ['#a90432', '#fbb800'], nation, league, tier }));
  const nations = [
    ['tr', 'Türkiye', 'k'], ['br', 'Brezilya', 'k'], ['es', 'İspanya', 'k'], ['it', 'İtalya', 'k'], ['ar', 'Arjantin', 'u'],
  ].map(([key, name, tier]) => ({ key, name, flag: 'bg:#ccc', tier }));
  const leagues = [{ key: 'l1', qid: 'QL1', name: 'Örnek Lig', short: 'ÖL' }, { key: 'l2', qid: 'QL2', name: 'Avrupa Ligi', short: 'AL' }];
  const positions = [['gk', 'Kaleci'], ['df', 'Defans'], ['mf', 'Orta saha'], ['fw', 'Forvet']].map(([key, name]) => ({ key, name }));
  const players = [];
  const seen = new Set();
  for (let i = 0; players.length < 900; i++) {
    let name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
    if (seen.has(name)) name += ` ${i}`;
    seen.add(name);
    const cl = new Set();
    while (cl.size < 3) cl.add(Math.floor(rng() * clubs.length));
    const cIdx = [...cl].sort((a, b) => a - b);
    const nat = [Math.floor(rng() * nations.length)];
    const lg = [...new Set(cIdx.map((c) => (clubs[c].league === 'l1' ? 0 : 1)))].sort();
    const by = 1970 + Math.floor(rng() * 35);
    const sl = 1 + Math.floor(rng() * 120);
    const pos = 1 << Math.floor(rng() * 4);
    const cupList = [0, 1].filter(() => rng() < 0.3);
    const mgrList = [0, 1].filter(() => rng() < 0.35);
    const wildList = [...(by >= 2000 ? [0] : []), ...(rng() < 0.15 ? [1] : [])];
    players.push([name, by, sl, cIdx, nat, lg, pos, [], 'QP' + i, cupList, mgrList, wildList]);
  }
  players.sort((a, b) => b[2] - a[2]);
  const cups = [
    { key: 'ucl', name: 'Şampiyonlar Ligi', short: 'ŞL', tier: 'k', desc: 'Şampiyonlar Ligi kazanmış', fail: 'Şampiyonlar Ligi kazanmadı' },
    { key: 'wc', name: 'Dünya Kupası', short: 'DK', tier: 'k', desc: 'Dünya Kupası kazanmış', fail: 'Dünya Kupası kazanmadı' },
  ];
  const managers = [{ key: 'QM1', name: 'Fatih Örnek', tier: 'k' }, { key: 'QM2', name: 'Jose Örnek', tier: 'k' }];
  const wilds = [
    { key: 'y2000', name: '2000 sonrası doğumlu', desc: '2000 ya da sonrasında doğmuş', fail: '2000 öncesi doğmuş', tier: 'k' },
    { key: 'ballon', name: "Ballon d'Or", desc: "Ballon d'Or kazanmış", fail: "Ballon d'Or kazanmadı", tier: 'k' },
  ];
  return { version: 1, builtAt: '2026-01-01T00:00:00Z', source: 'test', clubs, nations, leagues, positions, cups, managers, wilds, players };
}

export function writeFixtureDb(seed) {
  const dir = mkdtempSync(join(tmpdir(), 'fg-test-'));
  const file = join(dir, 'db.json');
  writeFileSync(file, JSON.stringify(makeFixtureDb(seed)));
  return file;
}

/** İstek/yanıt + gelen mesaj kuyruğu olan test istemcisi. */
export async function connect(port, hello = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((ok, fail) => {
    ws.once('open', ok);
    ws.once('error', fail);
  });
  const c = { ws, rid: 0, pending: new Map(), inbox: [], waiters: [], closed: null };
  ws.on('message', (data) => {
    const m = JSON.parse(data);
    if (m.t === 'res') {
      const p = c.pending.get(m.rid);
      c.pending.delete(m.rid);
      if (p) m.ok ? p.ok(m.data) : p.fail(Object.assign(new Error(m.error.message), m.error));
      return;
    }
    const w = c.waiters.find((x) => x.pred(m));
    if (w) {
      c.waiters.splice(c.waiters.indexOf(w), 1);
      clearTimeout(w.timer);
      w.ok(m);
    } else c.inbox.push(m);
  });
  ws.on('close', (code) => {
    c.closed = code;
  });
  c.req = (t, data = {}) =>
    new Promise((ok, fail) => {
      const rid = ++c.rid;
      c.pending.set(rid, { ok, fail });
      ws.send(JSON.stringify({ ...data, t, rid }));
    });
  /** Önce biriken mesajlara bakar; yoksa gelmesini bekler. */
  c.wait = (pred, ms = 4000) => {
    const i = c.inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(c.inbox.splice(0, i + 1).at(-1));
    return new Promise((ok, fail) => {
      const w = { pred, ok, timer: setTimeout(() => {
        c.waiters.splice(c.waiters.indexOf(w), 1);
        fail(new Error('mesaj gelmedi'));
      }, ms) };
      c.waiters.push(w);
    });
  };
  c.room = (pred = () => true, ms) => c.wait((m) => m.t === 'room' && m.room && pred(m.room), ms).then((m) => m.room);
  c.close = () => ws.close();
  c.hello = await c.req('hello', hello);
  return c;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
