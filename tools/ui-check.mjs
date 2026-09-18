/* Arayüz turu: sunucuyu süreç içinde başlatır (gerçek veri varsa onunla, yoksa test verisiyle),
   headless Chrome'da AYRI tarayıcı bağlamları (ayrı localStorage = ayrı oyuncular) açar ve
   oda kur → davet linkiyle katıl → aynı ad önerisi → QR → maç → sonuç → hızlı maç akışını sürer.

   node tools/ui-check.mjs [çıktı-klasörü]      (FIXTURE=1 → her zaman test verisi) */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { writeFixtureDb } from '../test/helpers.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(HERE, '..', '_shots');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const realDb = join(HERE, '..', 'server', 'data', 'db.json');
const useReal = existsSync(realDb) && !process.env.FIXTURE;
const app = createApp({ dbFile: useReal ? realDb : writeFixtureDb(5), joinLimit: 10_000 });
const port = await app.listen(0, '127.0.0.1');
const base = `http://localhost:${port}`;
console.log(`sunucu ${base} · ${useReal ? 'gerçek veri' : 'test verisi'} · ${app.db.players.length} futbolcu`);

/* ───────── Chrome + CDP (tek WS, düzleştirilmiş oturumlar) */

const cdpPort = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'fg-ui-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let browserWs;
for (let i = 0; i < 80 && !browserWs; i++) {
  try {
    browserWs = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    await sleep(150);
  }
}
const ws = new WebSocket(browserWs);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let msgId = 0;
const pending = new Map();
const pageErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    pageErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((ok, fail) => {
    const id = ++msgId;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

// Sayfa içinde kullanılan küçük yardımcılar
const PRELUDE = `
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const wait = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = typeof fn === 'string' ? document.querySelector(fn) : fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('beklenen gelmedi: ' + fn); await new Promise((r) => setTimeout(r, 40)); } };
  const norm = (s) => s.replace(/\\s+/g, ' ').trim().replace(/^[^\\p{L}\\p{N}"+]+/u, '');
  const btn = (text) => { const b = $$('button').find((x) => norm(x.textContent) === text); if (!b) throw new Error('düğme yok: ' + text); return b; };
  const type = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  // textContent: innerText CSS büyük harf dönüşümünü uyguluyor, kaynak metinle karşılaştırıyoruz
  const text = () => document.getElementById('app').textContent + '\\n' + document.getElementById('toasts').textContent;
`;

async function newPage(path, { width = 390, height = 844, mobile = true } = {}) {
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await s('Page.navigate', { url: base + path });
  const page = {
    async ev(code) {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${PRELUDE} ${code} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(name) {
      await sleep(350);
      const { cssContentSize } = await s('Page.getLayoutMetrics');
      const h = Math.min(4000, Math.ceil(cssContentSize.height));
      const img = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.max(h, height), scale: 1 } });
      writeFileSync(join(OUT, name), Buffer.from(img.data, 'base64'));
    },
  };
  await page.ev(`await wait(() => document.readyState === 'complete' && document.querySelector('#app .screen'));`);
  return page;
}

/* ───────── iddialar */

const results = [];
const check = (ok, name, extra = '') => {
  results.push([ok, name, extra]);
  console.log(`${ok ? '✔' : '✖'} ${name}${extra ? ' — ' + extra : ''}`);
};
const noOverflow = async (page, name) => {
  const o = await page.ev(`return { sw: document.documentElement.scrollWidth, w: innerWidth };`);
  check(o.sw <= o.w, `${name}: yatay taşma yok`, `${o.sw}/${o.w}`);
};

try {
  /* 1) ana sayfa */
  const A = await newPage('/');
  const home = await A.ev(`await wait('.home'); return { t: text(), ph: $('#nick').placeholder, w: innerWidth };`);
  check(home.w === 390, 'mobil görünüm 390px', String(home.w));
  check(home.t.includes('Futbol Bilginle Meydan Oku.'), 'ana sayfa: slogan');
  check(home.ph === 'Örn. Eren', 'ana sayfa: placeholder "Örn. Eren"');
  check(['OYNA', 'ODAYA KATIL', 'ODA OLUŞTUR'].every((b) => home.t.includes(b)), 'ana sayfa: üç düğme');
  await noOverflow(A, 'ana sayfa');
  await A.shot('01-home.png');

  const bad = await A.ev(`type($('#nick'), 'ab'); btn('OYNA').click(); await wait('.err:not(:empty)'); return $('.err').textContent;`);
  check(bad === 'Takma ad en az 3 karakter olmalı.', 'ana sayfa: kısa takma ad uyarısı', bad);

  /* 2) oda oluştur */
  await A.ev(`type($('#nick'), 'Eren'); btn('ODA OLUŞTUR').click(); await wait('.k-mode');`);
  const create = await A.ev(`return text();`);
  check(['2 Kişi', '3 Kişi', '4 Kişi', 'Klasik', 'Hızlı', 'Uzman', '15 sn', '30 sn', '45 sn', '60 sn', 'ODAYI OLUŞTUR'].every((x) => create.includes(x)), 'oda oluştur: tüm seçenekler');
  await A.ev(`$$('.chip').find((c) => c.textContent === '4 Kişi').querySelector('input').click();`);
  // ızgara kriterleri: türler kategori kategori görünür, hepsi açık gelir, kapatılan özete yazılır
  const cats = await A.ev(`
    $('.cat-group').open = true;
    const box = $('.cat-list');
    const on = $$('.cat-list input').filter((i) => i.checked).length;
    const labels = $$('.cat-list .cat-name b').map((b) => b.textContent);
    return { on, all: $$('.cat-list input').length, labels, note: box.parentElement.querySelector('.hint').textContent, sum: $('.cat-group summary').textContent };`);
  check(cats.all === 8 && cats.on === 8, 'kriterler: 8 tür, hepsi açık gelir (+ kulüp satırı)', `${cats.on}/${cats.all}`);
  check(['Kulüp', 'Ülke', 'Lig', 'Kupa', 'Teknik direktör', 'Takım arkadaşı', 'Özel şart', 'Boy', 'Mevki'].every((x) => cats.labels.includes(x)),
    'kriterler: kategori adları', cats.labels.join(', '));
  check(/Kulüp başlıkları her zaman var/.test(cats.note), 'kriterler: kulüp açıklaması', cats.note);
  check(cats.sum === 'Izgara kriterleri · 8/8 tür', 'kriterler: katlanmış başlık sayıyı gösterir', cats.sum);
  const catEx = await A.ev(`return $$('.cat-list .cat-name small').map((s) => s.textContent);`);
  check(catEx.every((t) => /\d+ başlık · /.test(t)), 'kriterler: her türde sayı ve örnek', catEx[0]);
  const catOff = await A.ev(`
    $$('.cat-list input').find((i) => i.value === 'mgr').click();
    $$('.cat-list input').find((i) => i.value === 'mate').click();
    return { sum: $('.cat-group summary').textContent, on: $$('.cat-list input').filter((i) => i.checked).length };`);
  check(catOff.on === 6 && /6\/8 tür/.test(catOff.sum), 'kriterler: tür kapatınca sayı düşer', catOff.sum);

  // türün içine gir: başlıkları tek tek kapat
  const cupPick = await A.ev(`
    $$('.cat-row').find((r) => r.textContent.startsWith('Kupa')).querySelector('button').click();
    await wait('.pick-list .pick');
    return { title: $('.modal-head h3').textContent, n: $$('.pick').length, first: $$('.pick .pick-body b')[0].textContent,
             sub: $$('.pick .pick-body small')[0].textContent, count: $('.pick-wrap .hint + * + * ~ .hint, .pick-wrap .hint:nth-of-type(2)')?.textContent || '' };`);
  check(cupPick.title === 'KUPA' && cupPick.n === 12, 'kriter seçici: kupa listesi açıldı', `${cupPick.title} · ${cupPick.n} başlık · ${cupPick.first} (${cupPick.sub})`);
  await A.shot('02c-cat-picker.png'); // seçici açıkken
  const picked = await A.ev(`
    const rows = $$('.pick');
    const byName = (n) => rows.find((r) => r.textContent.startsWith(n));
    byName('Copa América').querySelector('input').click();
    byName('Konferans Ligi').querySelector('input').click();
    const off = rows.filter((r) => !r.querySelector('input').checked).map((r) => r.querySelector('b').textContent);
    const txt = $$('.pick-wrap .hint').map((p) => p.textContent).join(' | ');
    btn('TAMAM').click(); await wait(() => !$('.modal'));
    return { off, txt, row: $$('.cat-row').find((r) => r.textContent.startsWith('Kupa')).textContent, sum: $('.cat-group summary').textContent };`);
  check(picked.off.join() === 'Konferans Ligi,Copa América' || picked.off.join() === 'Copa América,Konferans Ligi',
    'kriter seçici: seçilen başlıklar kapandı', picked.off.join(', '));
  check(/10\/12 başlık açık/.test(picked.row), 'kriter seçici: satır sayıyı gösteriyor', picked.row.replace(/\s+/g, ' ').trim());
  check(/2 başlık kapalı/.test(picked.sum), 'kriter seçici: özet sayıyı gösteriyor', picked.sum);
  // uzun listede arama: 104 kulüp
  const clubPick = await A.ev(`
    $$('.cat-row').find((r) => r.textContent.includes('Kulüp')).querySelector('button').click(); // kulüp satırı ✓ ile başlıyor
    await wait('.pick-list .pick');
    const all = $$('.pick').length;
    type($('.modal input[type=search]'), 'besik');
    await wait(() => $$('.pick').length < all);
    return { all, found: $$('.pick .pick-body b').map((b) => b.textContent) };`);
  check(clubPick.all === 53 && clubPick.found.join() === 'Beşiktaş', 'kriter seçici: aramada Türkçe katlanıyor ("besik" → Beşiktaş)', `${clubPick.all} kulüp → ${clubPick.found.join(', ')}`);
  await A.shot('02d-cat-search.png');
  await A.ev(`btn('TAMAM').click(); await wait(() => !$('.modal'));`);
  await noOverflow(A, 'oda oluştur');
  await A.ev(`$('.cat-group').open = false; scrollTo(0, 0);`);
  await A.shot('02-create.png');
  await A.ev(`$('.cat-group').open = true; $('.cat-group').scrollIntoView({ block: 'center' });`);
  await A.shot('02b-create-cats.png');
  await A.ev(`scrollTo(0, 0);`);
  const code = await A.ev(`btn('ODAYI OLUŞTUR').click(); return (await wait('.lobby .tk-code')).textContent;`);
  const sum = await A.ev(`return $('.lobby .settings').textContent;`);
  check(/Kapalı: teknik direktör, takım arkadaşı/.test(sum), 'lobi özeti: kapalı kriterleri yazar', sum);
  check(/^[A-HJ-NP-Z2-9]{5}$/.test(code), 'oda kodu 5 karakter', code);
  check((await A.ev(`return location.pathname;`)) === `/oda/${code}`, 'adres çubuğu /oda/KOD');

  /* 3) davet linkiyle katıl */
  const B = await newPage(`/oda/${code}`);
  const inv = await B.ev(`await wait('.ticket'); await wait(() => !/alınıyor/.test($('.lead').textContent)); return { t: text(), code: $('.tk-code').textContent };`);
  check(inv.code === code && inv.t.includes('Takma adını gir'), 'davet ekranı: kod + "Takma adını gir"');
  check(/Host: Eren · 1\/4 oyuncu · Klasik · 30 sn/.test(inv.t), 'davet ekranı: oda bilgisi', inv.t.split('\n').find((l) => l.includes('Host')));
  await B.shot('03-invite.png');
  await B.ev(`type($('#nick-inv'), 'Ahmet'); btn('ODAYA KATIL').click(); await wait('.lobby');`);

  /* 4) aynı ad → öneri */
  const C = await newPage(`/oda/${code}`);
  const taken = await C.ev(`await wait('.ticket'); type($('#nick-inv'), 'eren'); btn('ODAYA KATIL').click(); await wait(() => $('.err')?.textContent.includes('zaten')); return $('.err').textContent;`);
  check(taken.includes('"eren" zaten kullanılıyor.') && taken.includes('"eren123" deneyebilirsin.'), 'aynı ad: uyarı + öneri', taken);
  await C.shot('04-nick-taken.png');
  await C.ev(`$('.err .link').click(); await wait('.lobby');`);

  /* 5) lobi */
  const lob = await A.ev(`await wait(() => $$('.pl:not(.empty)').length === 3); return { t: text(), crown: $$('.pl')[0].textContent.includes('👑'), empty: $$('.pl.empty').length };`);
  check(lob.t.includes('ODADAKİ OYUNCULAR') && lob.t.includes('3 / 4'), 'lobi: oyuncu listesi 3 / 4');
  check(lob.crown, 'lobi: host yanında 👑');
  check(lob.empty === 1 && lob.t.includes('Oyuncu bekleniyor...'), 'lobi: boş koltuk "Oyuncu bekleniyor..."');
  check(['KODU KOPYALA', 'DAVET LİNKİNİ KOPYALA', 'QR KOD', 'MAÇI BAŞLAT'].every((b) => lob.t.includes(b)), 'lobi: paylaşım düğmeleri + MAÇI BAŞLAT');
  await noOverflow(A, 'lobi');
  await A.shot('05-lobby-host.png');
  const guest = await B.ev(`await wait(() => $$('.pl:not(.empty)').length === 3); return text();`);
  check(guest.includes("Host'un maçı başlatması bekleniyor") && !guest.includes('MAÇI BAŞLAT'), 'lobi (misafir): bekleme yazısı, başlat düğmesi yok');
  await B.shot('06-lobby-guest.png');

  // lobide host ayarları düzenler: kriter paneli modalda da çalışır ve kaydedilir
  const catSave = await A.ev(`
    btn('AYARLAR').click(); await wait('.modal .cat-list');
    $('.modal .cat-group').open = true;
    $$('.modal .cat-list input').find((i) => i.value === 'mgr').click();
    return { sum: $('.modal .cat-group summary').textContent, off: $$('.modal .cat-list input').filter((i) => !i.checked).map((i) => i.value) };`);
  check(/^Izgara kriterleri · 7\/8 tür/.test(catSave.sum) && catSave.off.join() === 'mate', 'lobi ayarları: kriter paneli açılıyor', catSave.sum);
  await A.shot('05b-lobby-settings.png');
  const saved = await A.ev(`
    btn('KAYDET').click(); await wait(() => !$('.modal'));
    await wait(() => !/teknik direktör/.test($('.lobby .settings').textContent));
    return $('.lobby .settings').textContent;`);
  check(/Kapalı: takım arkadaşı/.test(saved) && !/teknik direktör/.test(saved), 'lobi ayarları: kriter değişikliği kaydedildi', saved);

  const qr = await A.ev(`btn('QR KOD').click(); await wait('.qr path'); return $('.qr-box .mono').textContent;`);
  check(qr.endsWith(`/oda/${code}`), 'QR: davet linkinin QR kodu', qr);
  await A.shot('07-qr.png');
  await A.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));`);

  /* 6) maç */
  await A.ev(`btn('MAÇI BAŞLAT').click(); await wait('.countdown .cd-num');`);
  await A.shot('08-countdown.png');
  await A.ev(`await wait('.screen.game', 7000);`);
  const g = await A.ev(`return { cells: $$('.grid .cell').length, heads: $$('.grid .hcat').length };`);
  check(g.cells === 16 && g.heads === 8, '3 oyuncu → 4×4 ızgara', JSON.stringify(g));
  await noOverflow(A, 'maç');

  const pages = { A, B, C };
  const room = app.rooms.rooms.get(code);
  const whose = async () => {
    for (const [k, p] of Object.entries(pages)) if (await p.ev(`return !!document.querySelector('.banner.mine');`)) return [k, p];
    return [null, null];
  };
  const pick = async (page, cell, player) => {
    await page.ev(`$$('.grid .cell')[${cell}].click(); await wait('.answer:not([hidden])'); type($('.answer input'), ${JSON.stringify(player.name)});
      const li = await wait(() => $$('.sugg li').find((l) => l.querySelector('.nm')?.textContent === ${JSON.stringify(player.name)}));
      li.click();`);
  };

  let [k1, P1] = await whose();
  check(!!P1, 'sırası gelen oyuncunun ekranında "Sıra sende"', k1);
  const cell1 = room.game.cells.findIndex((c) => !c.owner);
  const [r1, c1] = room.game.catsOf(cell1);
  const good = app.db.answers(r1, c1, 5, room.game.used)[0];
  await P1.ev(`$$('.grid .cell')[${cell1}].click(); await wait('.answer:not([hidden])');`);
  await P1.shot('09-answer-panel.png');
  await pick(P1, cell1, good);
  await A.ev(`await wait(() => $$('.grid .cell')[${cell1}].classList.contains('owned'));`);
  check((await A.ev(`return $$('.grid .cell')[${cell1}].textContent;`)).includes(good.name), 'doğru cevap: hücre boyandı, isim yazıldı', good.name);

  const [k2, P2] = await whose();
  check(k2 && k2 !== k1, 'sıra bir sonraki oyuncuya geçti', `${k1} → ${k2}`);
  const cell2 = room.game.cells.findIndex((c) => !c.owner);
  const [r2] = room.game.catsOf(cell2);
  const wrong = app.db.players.find((p) => !app.db.matches(p, r2) && p.sl > 20 && !room.game.used.has(p.i));
  await pick(P2, cell2, wrong);
  const feed = await A.ev(`await wait(() => $('.feed li')?.textContent.includes('❌')); return $('.feed li').textContent;`);
  check(/oynamadı|değil/.test(feed), 'yanlış cevap: akışta sebep', feed);
  await A.shot('10-game.png');
  await (await whose())[1].shot('11-game-turn.png');

  /* 7) sonuç */
  room.game.end('turns');
  const res = await A.ev(`await wait('.results:not([hidden]) .rhead h2'); return { h: $('.rhead h2').textContent, t: text() };`);
  check(res.t.includes('RÖVANŞ') && res.t.includes('ANA SAYFA'), 'sonuç: host için RÖVANŞ + ANA SAYFA', res.h);
  check(/ELO \d+/.test(res.t), 'sonuç: ELO değişimi gösteriliyor');
  await A.shot('12-results.png');
  const stats = await A.ev(`return JSON.parse(localStorage.getItem('fg.stats.v1'));`);
  check(stats?.matches === 1 && stats.correct + stats.wrong >= 0, 'istatistik: cihazda 1 maç kaydı', JSON.stringify({ m: stats?.matches, w: stats?.wins, l: stats?.losses, elo: stats?.elo }));

  /* 8) yenileme: aynı oturumla odaya dön */
  await B.ev(`location.reload();`);
  await sleep(1500);
  const back = await B.ev(`await wait('.screen.game', 6000); return location.pathname;`);
  check(back === `/oda/${code}`, 'sayfa yenilenince aynı odaya geri bağlandı');

  /* 9) host ayrılınca devir */
  await A.ev(`btn('ANA SAYFA').click(); await wait('.home');`);
  const newHost = await B.ev(`await wait(() => document.body.innerText.includes('RÖVANŞ') || $$('.toast').some((t) => t.textContent.includes('host')), 5000); return $$('.toast').map((t) => t.textContent).join(' | ');`);
  check(/host/i.test(newHost), 'host ayrılınca yetki devredildi', newHost);

  /* 10) hızlı maç */
  const D = await newPage('/');
  await D.ev(`type($('#nick'), 'Şahin'); btn('OYNA').click(); await wait('.sizes');`);
  await D.shot('13-quick.png');
  await D.ev(`$$('.size-card')[0].click(); await wait('.searching');`);
  const sr = await D.ev(`await wait(() => /\\d+/.test($('.qstats dd:nth-of-type(2)').textContent)); return text();`);
  check(sr.includes('🔎 Rakip aranıyor...') && sr.includes('2 kişilik maç aranıyor...') && sr.includes('Bekleyen oyuncular') && sr.includes('Ortalama bekleme'), 'rakip aranıyor ekranı');
  await D.shot('14-searching.png');
  const E = await newPage('/');
  await E.ev(`type($('#nick'), 'Mert'); btn('OYNA').click(); await wait('.sizes'); $$('.size-card')[0].click();`);
  const found = await D.ev(`await wait('.countdown'); return $('.cd-title').textContent;`);
  check(found === 'RAKİPLER BULUNDU!', 'eşleşme: "RAKİPLER BULUNDU!"', found);
  await D.shot('15-found.png');

  /* 11) aynı anda modu + ipucu + oyuncu kartı */
  const H = await newPage('/');
  await H.ev(`type($('#nick'), 'Hızlıcı'); btn('ODA OLUŞTUR').click(); await wait('.k-style');
    $$('.chip').find((c) => c.textContent.startsWith('Aynı anda')).querySelector('input').click();
    $$('.chip').find((c) => c.textContent.startsWith('Tekrar olur')).querySelector('input').click();
    $('.cat-group').open = true;
    for (const i of $$('.cat-list input')) if (i.value !== 'ht' && i.checked) i.click();`); // yalnız Boy açık kalsın
  const formTxt = await H.ev(`return text();`);
  check(['Oyun tarzı', 'Maç süresi', 'İpucu', 'Aynı futbolcu', 'Tekrar olur'].every((x) => formTxt.includes(x)), 'oda oluştur: tarz, maç süresi, ipucu, aynı futbolcu seçenekleri');
  await H.shot('17-create-race.png');
  const htOnly = await H.ev(`return $('.cat-group summary').textContent;`);
  check(htOnly === 'Izgara kriterleri · 1/8 tür', 'kriterler: yalnız Boy açık bırakılabiliyor', htOnly);
  const rc = await H.ev(`btn('ODAYI OLUŞTUR').click(); return (await wait('.lobby .tk-code')).textContent;`);
  const G2 = await newPage('/oda/' + rc);
  await G2.ev(`await wait('.ticket'); type($('#nick-inv'), 'Rakip'); btn('ODAYA KATIL').click(); await wait('.lobby');`);
  const lobbyTxt = await H.ev(`await wait(() => $$('.pl:not(.empty)').length === 2); return $('.settings').textContent;`);
  check(/Aynı anda · 3 dk/.test(lobbyTxt) && /tekrar olur/.test(lobbyTxt), 'lobi: ayar özeti', lobbyTxt);
  await H.ev(`btn('MAÇI BAŞLAT').click(); await wait('.screen.game', 7000);`);
  const htHead = await H.ev(`
    const tiles = $$('.hcat').map((t) => ({ type: [...t.classList].find((c) => c.startsWith('t-')), txt: t.textContent, ruler: !!t.querySelector('.ruler text') }));
    return { ht: tiles.filter((t) => t.type === 't-ht'), types: [...new Set(tiles.map((t) => t.type))] };`);
  check(htHead.ht.length > 0, 'boy başlığı ızgaraya geldi', htHead.ht.map((t) => t.txt).join(' | '));
  check(htHead.ht.every((t) => t.ruler && / m ve (üstü|altı)boyunda/.test(t.txt)), 'boy başlığı: ölçü şeridi simgesi + "… boyunda"', htHead.ht[0]?.txt);
  check(htHead.types.every((t) => t === 't-club' || t === 't-ht'), 'yalnız Boy açıkken başka tür gelmedi', htHead.types.join(' '));
  const raceInfo = await H.ev(`return { t: $('.gturn').textContent, b: $('.btxt').textContent, m: $('.gmode').textContent };`);
  // Aynı anda modunda hamle sayacı yok (sıra yok); mod bilgisi üst şeritteki etikette
  check(raceInfo.t === '' && /Aynı anda/.test(raceInfo.b) && /Aynı anda/.test(raceInfo.m), 'aynı anda modu: sıra yok, herkes oynar', JSON.stringify(raceInfo));
  const rroom = app.rooms.rooms.get(rc);
  const free = rroom.game.cells.findIndex((c) => !c.owner);
  await H.ev(`$$('.grid .cell')[${free}].click(); await wait('.answer:not([hidden])'); $('.hint-btn').click(); await wait('.hintbox:not([hidden])');`);
  const hintTxt = await H.ev(`return $('.hintbox').textContent;`);
  check(/💡 .+ bir cevap: [^·]*[A-ZÇĞİÖŞÜ]\./.test(hintTxt), 'ipucu: baş harfler yazıyor', hintTxt);
  check(!/\d+ harf|harfli/.test(hintTxt), 'ipucu: harf sayısı yazmıyor', hintTxt);
  await H.shot('18-race-hint.png');
  const [rr, cc] = rroom.game.catsOf(free);
  const ans = app.db.answers(rr, cc, 1)[0];
  await pick(H, free, ans);
  await H.ev(`await wait(() => $$('.grid .cell')[${free}].classList.contains('owned'));`);
  rroom.game.end('time');
  await H.ev(`await wait('.results:not([hidden])'); $$('.grid .cell')[${free}].click(); await wait('.pcard');`);
  const cardTxt = await H.ev(`return $('.pcard').textContent;`);
  check(cardTxt.includes('KULÜPLERİ'), 'oyuncu kartı açıldı', ans.name);
  check(!ans.ht || new RegExp(`${(ans.ht / 100).toFixed(2).replace('.', ',')} m`).test(cardTxt), 'oyuncu kartında boy yazıyor', `${ans.name} ${ans.ht} cm`);
  await H.shot('19-player-card.png');

  /* 12) masaüstü */
  const W = await newPage('/', { width: 1280, height: 860, mobile: false });
  await W.shot('16-home-desktop.png');
  await noOverflow(W, 'masaüstü ana sayfa');
} catch (e) {
  check(false, 'tur yarıda kaldı', e.message);
} finally {
  check(pageErrors.length === 0, 'sayfada JS hatası yok', pageErrors.slice(0, 3).join(' || '));
  const failed = results.filter((r) => !r[0]).length;
  console.log(`\n${results.length - failed}/${results.length} iddia geçti · ekran görüntüleri: ${OUT}`);
  ws.close();
  chrome.kill();
  await app.close();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* windows dosya kilidi */
  }
  process.exit(failed ? 1 : 0);
}
