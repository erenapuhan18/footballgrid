import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateNick, sameNick, suggestNick, isProfane } from '../server/nickname.js';
import { makeCode, normalizeCode, CODE_ALPHABET } from '../server/codes.js';
import { fold, locative } from '../server/text.js';
import { FootballDB } from '../server/db.js';
import { makeGrid, MODES } from '../server/grid.js';
import { Game, gameShape, linesFor } from '../server/game.js';
import { writeFixtureDb, sleep } from './helpers.mjs';

const db = new FootballDB(writeFixtureDb(3));

/* ───────── takma ad */

test('takma ad: uzunluk, Türkçe harfler, boşluk temizliği', () => {
  assert.equal(validateNick('Er').ok, false);
  assert.equal(validateNick('Eren').ok, true);
  for (const n of ['Şahin', 'Çağrı Öztürk', 'Işıl', 'Gökhan_10', 'İlkay G.']) assert.equal(validateNick(n).ok, true, n);
  assert.equal(validateNick('ErenErenErenEren1').ok, false, '17 karakter');
  assert.equal(validateNick('Eren<b>').ok, false);
  assert.equal(validateNick('  Eren    Can ').nick, 'Eren Can');
});

test('takma ad: spam ve bağlantı süzgeci', () => {
  for (const n of ['12345', 'aaaaaa', 'Erennnnn', 'abababab', 'www.site.com', 'discord gg', 'admin']) {
    assert.equal(validateNick(n).ok, false, n);
  }
});

test('takma ad: küfür süzgeci yakalar ama masum adları geçirir', () => {
  for (const n of ['amk', 'orospu', 'SİKTİR', 's1kt1r', 'o.r.o.s.p.u', 'Piç Kurusu', 'fuck you', 'yavşak']) {
    assert.equal(isProfane(n), true, n);
  }
  for (const n of ['Işık', 'Sıkıntı', 'Götze', 'Namık', 'Hassan', 'Kasımpaşa', 'Amine', 'Sikkim']) {
    assert.equal(isProfane(n), false, n);
  }
});

test('takma ad: aynı ad karşılaştırması ve öneri', () => {
  assert.equal(sameNick('Eren', 'EREN'), true);
  assert.equal(sameNick('Şahin', 'sahin'), true);
  assert.equal(sameNick('Eren', 'Eren_'), true);
  assert.equal(sameNick('Eren', 'Erenn'), false);
  assert.equal(suggestNick('Eren', ['Eren']), 'Eren123');
  assert.equal(suggestNick('Eren', ['Eren', 'Eren123']), 'Eren2');
  assert.ok([...suggestNick('Abdurrahmanxyzq', ['Abdurrahmanxyzq'])].length <= 16);
});

/* ───────── oda kodu */

test('oda kodu: 5 karakter, Türkçe harf yok, çakışınca 6', () => {
  for (let i = 0; i < 300; i++) {
    const c = makeCode(() => false);
    assert.equal(c.length, 5);
    assert.ok([...c].every((ch) => CODE_ALPHABET.includes(ch)), c);
  }
  assert.equal(makeCode((c) => c.length === 5).length, 6);
  assert.ok(!/[ÇĞİÖŞÜ01OI]/.test(CODE_ALPHABET));
});

test('oda kodu: büyük/küçük harf ve yazım farkları', () => {
  assert.equal(normalizeCode('7k4p9'), '7K4P9');
  assert.equal(normalizeCode(' a8f2x '), 'A8F2X');
  assert.equal(normalizeCode('q92-lm'), 'Q92LM');
  assert.equal(normalizeCode('qı2lm'), 'QI2LM');
  assert.equal(normalizeCode('ab'), null);
  assert.equal(normalizeCode('1234567'), null);
  assert.equal(normalizeCode('ŞŞŞŞŞ'), null);
});

/* ───────── metin */

test('Türkçe katlama ve bulunma eki', () => {
  assert.equal(fold('İSTANBUL Şükrü'), 'istanbul sukru');
  assert.equal(fold('IŞIK'), 'isik');
  const cases = {
    'Real Madrid': "Real Madrid'de", Beşiktaş: "Beşiktaş'ta", Galatasaray: "Galatasaray'da", Fenerbahçe: "Fenerbahçe'de",
    PSG: "PSG'de", 'Schalke 04': "Schalke 04'te", Juventus: "Juventus'ta", 'Serie A': "Serie A'da", 'Ligue 1': "Ligue 1'de",
    Liverpool: "Liverpool'da", MLS: "MLS'de", 'Premier Lig': "Premier Lig'de", Ajax: "Ajax'ta",
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(locative(k), v);
});

/* ───────── veritabanı ve ızgara */

test('veritabanı: sayım ile cevap listesi tutarlı, arama Türkçe katlıyor', () => {
  const [a, b] = [db.catByKey.get('club:aas'), db.catByKey.get('nat:br')];
  assert.equal(db.answers(a, b, 100000).length, db.count(a, b));
  assert.ok(db.answers(a, b, 5).every((p) => db.matches(p, a) && db.matches(p, b)));
  assert.ok(db.search('yilmaz').length > 0 && db.search('yilmaz').every((x) => /Yılmaz/.test(x.name)));
  assert.ok(db.search('sahin').some((x) => x.name.includes('Şahin')));
  assert.deepEqual(db.search('a'), []);
  assert.equal(db.failText(db.catByKey.get('nat:br')), 'Brezilya uyruklu değil');
});

test('veritabanı: kupa, menajer ve joker kategorileri', () => {
  const cup = db.catByKey.get('cup:ucl');
  const mgr = db.catByKey.get('mgr:QM1');
  const wild = db.catByKey.get('wild:y2000');
  assert.ok(cup && mgr && wild);
  assert.ok(db.count(cup, cup) > 0 && db.count(mgr, mgr) > 0 && db.count(wild, wild) > 0);
  assert.ok(db.answers(wild, wild, 1000).every((p) => p.by >= 2000));
  assert.equal(db.failText(cup), 'Şampiyonlar Ligi kazanmadı');
  assert.equal(db.failText(mgr), 'Fatih Örnek ile çalışmadı');
  assert.equal(db.publicCat(mgr).desc, 'Fatih Örnek ile çalışmış');
  assert.equal(db.publicCat(cup).short, 'ŞL');
  // Başlıklar ne istendiğini açıkça söyler
  assert.deepEqual(db.publicCat(mgr).head, ['Fatih Örnek', 'ile çalıştı']);
  assert.deepEqual(db.publicCat(cup).head, ['Şampiyonlar Ligi', 'kazandı']);
  assert.deepEqual(db.publicCat(db.catByKey.get('lg:l1')).head, ["Örnek Lig'de", 'oynadı']);
  assert.deepEqual(db.publicCat(db.catByKey.get('nat:br')).head, ['Brezilya', 'uyruklu']);
  assert.deepEqual(db.publicCat(db.catByKey.get('club:aas')).head, ['Aslanspor', '']);
});

test('veritabanı: Türkiye jokerleri ve oyuncu kartı', () => {
  const abroad = db.catByKey.get('wild:trabroad');
  assert.ok(abroad && db.catByKey.get('wild:derby') && db.catByKey.get('wild:trforeign'));
  assert.deepEqual(db.publicCat(abroad).head, ['Yurt dışında oynamış', 'Türk']);
  const tr = db.catByKey.get('nat:tr').idx;
  const trClubs = db.cats.filter((c) => c.type === 'club' && c.nation === 'tr').map((c) => c.idx);
  const list = db.answers(abroad, abroad, 10000);
  assert.ok(list.length > 0);
  assert.ok(list.every((p) => p.nats.includes(tr) && p.clubs.some((ci) => !trClubs.includes(ci))));
  const card = db.card(list[0].i);
  assert.equal(card.name, list[0].name);
  assert.ok(card.clubs.length >= 1 && card.clubs.every((c) => c.name && c.colors));
  assert.ok(card.nats.some((n) => n.name === 'Türkiye'));
  assert.ok(card.wild.includes('Yurt dışında oynamış Türk'));
  assert.equal(db.card(10 ** 9), null);
});

test('ızgara: her modda çözülebilir, bariz hücre yok, tür karışımı var', () => {
  const colTypes = new Set();
  for (const [mode, size] of [['klasik', 3], ['klasik', 4], ['hizli', 3], ['uzman', 3], ['uzman', 4]]) {
    for (let k = 0; k < 20; k++) {
      const { rows, cols } = makeGrid(db, mode, size);
      assert.equal(rows.length, size);
      assert.equal(cols.length, size);
      assert.equal(new Set([...rows, ...cols].map((c) => c.key)).size, size * 2, 'tekrar eden başlık');
      const nonClubRows = rows.filter((r) => r.type !== 'club').length;
      assert.ok(mode === 'uzman' ? nonClubRows <= 1 : nonClubRows === 0, `${mode}: satırlar kulüp`);
      if (mode !== 'uzman') assert.ok(cols.some((c) => c.type === 'nat'), `${mode}: ülke sütunu yok`);
      const known = db.knownLimit(MODES[mode].knownSl);
      for (const r of rows) {
        for (const c of cols) {
          colTypes.add(c.type);
          assert.ok(db.count(r, c, known) >= MODES[mode].minAnswers, `${mode} ${r.name}×${c.name}`);
          if (r.type === 'club' && c.type === 'nat') assert.notEqual(r.nation, c.natKey, 'kulüp × kendi ülkesi');
        }
      }
    }
  }
  for (const t of ['club', 'nat', 'cup', 'mgr', 'wild']) assert.ok(colTypes.has(t), 'sütunlarda tür yok: ' + t);
});

/* ───────── maç motoru */

function newGame(mode = 'klasik', n = 2, turnTime = 30, win, opts = {}) {
  const players = ['A', 'B', 'C', 'D'].slice(0, n).map((pid, i) => ({ pid, nick: pid, color: ['blue', 'red', 'green', 'yellow'][i], bot: false }));
  const g = new Game({ db, mode, turnTime, win, players, grid: makeGrid(db, mode, gameShape(mode, n, win).size), rng: () => 0.1, ...opts });
  g.start();
  return g;
}
const answerFor = (g, cell) => {
  const [r, c] = g.catsOf(cell);
  return db.answers(r, c, 50, g.used)[0];
};
const wrongFor = (g, cell) => {
  const [r] = g.catsOf(cell);
  return db.players.find((p) => !db.matches(p, r) && !g.used.has(p.i));
};
/** Oyuncu hedef hücreleri sırayla kapar, diğerleri pas geçer. */
function playFor(g, pid, targets) {
  const todo = [...targets];
  while (!g.over && todo.length) {
    if (g.turn.pid === pid) {
      const cell = todo.shift();
      g.answer(pid, cell, answerFor(g, cell).i);
    } else g.pass(g.turn.pid);
  }
}
/** İlk satırda iki sütuna birden uyan bir futbolcu (tekrar kullanım testi için). */
function sharedPlayer(g) {
  for (let c1 = 0; c1 < g.size; c1++) {
    for (let c2 = c1 + 1; c2 < g.size; c2++) {
      const p = db.players.find((x) => db.matches(x, g.rows[0]) && db.matches(x, g.cols[c1]) && db.matches(x, g.cols[c2]));
      if (p) return [c1, c2, p];
    }
  }
  return null;
}

test('maç şekli: oyuncu sayısı, mod ve kazanma kuralına göre', () => {
  assert.deepEqual(gameShape('klasik', 2), { size: 3, maxTurns: 16, lineWin: true, steal: false });
  assert.equal(gameShape('klasik', 3).size, 4);
  assert.equal(gameShape('klasik', 3, 'line3').lineWin, true);
  assert.equal(gameShape('klasik', 3, 'most').lineWin, false);
  assert.equal(gameShape('klasik', 4).maxTurns, 28);
  assert.equal(gameShape('hizli', 4).size, 3);
  assert.equal(gameShape('uzman', 2).steal, true);
  assert.equal(linesFor(3, 3).length, 8);
  assert.equal(linesFor(4, 3).length, 24);
});

test('maç: doğru cevap hücreyi boyar, yanlış sırayı geçirir, kullanılan futbolcu reddedilir', () => {
  const g = newGame();
  const first = g.turn.pid;
  const second = g.order.find((p) => p !== first);
  assert.equal(g.answer(second, 0, 0).error, 'Sıra sende değil.');
  const p = answerFor(g, 0);
  assert.deepEqual(g.answer(first, 0, p.i), { ok: true, correct: true });
  assert.equal(g.cells[0].owner, first);
  assert.equal(g.turn.pid, second);
  assert.match(g.answer(second, 1, p.i).error, /zaten kullanıldı/);
  assert.equal(g.turn.pid, second, 'kullanılmış futbolcu sırayı yakmaz');
  assert.equal(g.answer(second, 0, answerFor(g, 0).i).error, 'Bu hücre dolu.');
  const w = g.answer(second, 1, wrongFor(g, 1).i);
  assert.equal(w.correct, false);
  assert.ok(w.reasons.length >= 1);
  assert.equal(g.turn.pid, first);
  g.dispose();
});

test('maç: 2 kişide yan yana üç hücre kazanır', () => {
  const g = newGame();
  const a = g.turn.pid;
  playFor(g, a, [0, 1, 2]);
  assert.equal(g.over, true);
  assert.equal(g.result.reason, 'line');
  assert.deepEqual(g.result.winners, [a]);
  assert.deepEqual(g.result.winLine, [0, 1, 2]);
  assert.equal(g.result.standings[0].pid, a);
  assert.ok(g.result.answers.every((x) => Array.isArray(x.alts) && x.total >= 1));
  assert.ok(g.result.answers.every((x) => x.alts.every((alt) => Number.isInteger(alt.id) && alt.name)));
  g.dispose();
});

test("maç: 3 kişide 3'leme — 4×4'te yan yana 3 hücre (yatay ve çapraz) kazanır", () => {
  for (const cells of [[5, 6, 7], [0, 5, 10], [3, 6, 9]]) {
    const g = newGame('klasik', 3, 30, 'line3');
    assert.equal(g.size, 4);
    const a = g.turn.pid;
    playFor(g, a, cells);
    assert.equal(g.over, true, cells.join(','));
    assert.equal(g.result.reason, 'line');
    assert.deepEqual(g.result.winners, [a]);
    assert.deepEqual([...g.result.winLine].sort((x, y) => x - y), cells);
    g.dispose();
  }
});

test("maç: 'en çok hücre' kuralında üçlü dizi maçı bitirmez", () => {
  const g = newGame('klasik', 3, 30, 'most');
  const a = g.turn.pid;
  playFor(g, a, [0, 1, 2]);
  assert.equal(g.over, false);
  while (!g.over) g.pass(g.turn.pid);
  assert.equal(g.result.reason, 'turns');
  assert.deepEqual(g.result.winners, [a]);
  g.dispose();
});

test('maç: aynı anda modu — sıra yok, ilk doğru bilen kapar, yanlışa 3 sn ceza, süre bitince en çok hücre', async () => {
  const g = newGame('klasik', 2, 30, undefined, { style: 'race', matchTime: 0.3 });
  const [a, b] = g.order;
  assert.equal(g.turn, null);
  assert.ok(g.deadline > Date.now());
  assert.equal(g.answer(b, 0, answerFor(g, 0).i).correct, true, 'sırası olmayan da cevap verebilir');
  assert.equal(g.answer(a, 0, answerFor(g, 0).i).error, 'Bu hücre dolu.');
  const w = g.answer(a, 1, wrongFor(g, 1).i);
  assert.equal(w.correct, false);
  assert.equal(w.penalty, 3);
  assert.match(g.answer(a, 2, answerFor(g, 2).i).error, /ceza/);
  assert.equal(g.pass(a).ok, false);
  await sleep(400);
  assert.equal(g.over, true);
  assert.equal(g.result.reason, 'time');
  assert.deepEqual(g.result.winners, [b]);
  g.dispose();
});

test('maç: "aynı futbolcu" ayarı — kapalıyken reddedilir, açıkken başka hücrede kabul edilir', () => {
  for (const reuse of [false, true]) {
    let g = null;
    let found = null;
    for (let k = 0; k < 40 && !found; k++) {
      g?.dispose();
      g = newGame('klasik', 2, 30, undefined, { reuse });
      found = sharedPlayer(g);
    }
    assert.ok(found, 'iki hücreye uyan futbolcu bulunamadı');
    const [c1, c2, p] = found;
    const a = g.turn.pid;
    const b = g.order.find((x) => x !== a);
    assert.equal(g.answer(a, c1, p.i).correct, true);
    const r = g.answer(b, c2, p.i);
    if (reuse) assert.equal(r.correct, true, 'tekrar kullanım açık');
    else assert.match(r.error, /zaten kullanıldı/);
    g.dispose();
  }
});

test('maç: ipucu — maç başına bir kez, sırayı yakmaz, kapalıysa verilmez', () => {
  const g = newGame('klasik', 2, 30, undefined, { hints: true });
  const a = g.turn.pid;
  const r = g.hint(a, 0);
  assert.equal(r.ok, true);
  assert.ok(r.hint.initials.includes('.') && r.hint.letters > 0);
  assert.equal(g.hint(a, 0).error, 'İpucu hakkını bu maçta kullandın.');
  assert.equal(g.turn.pid, a, 'ipucu sırayı yakmaz');
  assert.equal(g.log.at(-1).kind, 'hint');
  g.dispose();
  const off = newGame('klasik', 2, 30, undefined, { hints: false });
  assert.equal(off.hint(off.turn.pid, 0).error, 'Bu odada ipucu kapalı.');
  off.dispose();
});

test('maç: hamle sınırı dolunca en çok hücre kapan kazanır', () => {
  const g = newGame('klasik', 3);
  const first = g.turn.pid;
  g.answer(first, 5, answerFor(g, 5).i);
  while (!g.over) g.pass(g.turn.pid);
  assert.equal(g.result.reason, 'turns');
  assert.equal(g.turnNo, g.maxTurns);
  assert.deepEqual(g.result.winners, [first]);
  g.dispose();
});

test('maç: süre dolunca sıra geçer', async () => {
  const g = newGame('klasik', 2, 0.06);
  const first = g.turn.pid;
  await sleep(120);
  assert.notEqual(g.turn.pid, first);
  assert.equal(g.log.at(-1).kind, 'timeout');
  g.dispose();
});

test('maç: rakip ayrılırsa kalan kazanır', () => {
  const g = newGame();
  const a = g.turn.pid;
  const b = g.order.find((p) => p !== a);
  g.leave(b);
  assert.equal(g.over, true);
  assert.equal(g.result.reason, 'forfeit');
  assert.deepEqual(g.result.winners, [a]);
  g.dispose();
});

test('maç: Uzman modda hücre çalınır ve kilitlenir', () => {
  const g = newGame('uzman');
  const a = g.turn.pid;
  const b = g.order.find((p) => p !== a);
  g.answer(a, 4, answerFor(g, 4).i);
  const steal = g.answer(b, 4, answerFor(g, 4).i);
  assert.equal(steal.correct, true);
  assert.equal(g.cells[4].owner, b);
  assert.equal(g.cells[4].locked, true);
  assert.equal(g.answer(a, 4, answerFor(g, 4)?.i ?? 0).error, 'Bu hücre kilitli, çalınamaz.');
  g.dispose();
});
