/* FOOTBALLGRID istemcisi — ekranlar ve akış.
   Kimlik: sunucunun verdiği geçici playerId + jeton (localStorage). Hesap yok. */

import { Net } from './net.js';
import { store } from './store.js';
import { h, put, toast, modal, copyText, qrSvg, gridGlyph } from './ui.js';
import { GameScreen } from './gameview.js';

const app = document.getElementById('app');
const netbar = document.getElementById('net');

const MODE = {
  klasik: { name: 'Klasik', desc: 'Büyük kulüpler, ülkeler, ligler, kupalar, menajerler, jokerler' },
  hizli: { name: 'Hızlı', desc: '3×3 ızgara, az hamle, çabuk biter' },
  uzman: { name: 'Uzman', desc: 'Bütün kulüpler, mevkiler, zor başlıklar · hücre çalma' },
};
const WIN = { line3: "3'leme", most: 'En çok hücre', points: 'Nadirlik puanı' };

const S = {
  pid: null,
  room: null,
  queue: null,
  publicUrl: location.origin,
  db: null,
  welcomed: false,
  routeCode: codeFromPath(),
  records: {},
};

/* ───────── yol ve kod yardımcıları */

function normCode(raw) {
  let t = String(raw || '');
  const at = t.search(/\/oda\//i);
  if (at >= 0) t = t.slice(at + 5);
  return t.replace(/[ıİi]/g, 'I').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
function codeFromPath() {
  const m = location.pathname.match(/^\/oda\/([A-Za-z0-9ıİ]{4,8})\/?$/);
  return m ? normCode(m[1]) : null;
}
function setPath(p) {
  if (location.pathname !== p) history.replaceState(null, '', p + location.search);
}
const inviteLink = (code) => `${S.publicUrl}/oda/${code}`;
const fine = () => matchMedia('(pointer: fine)').matches;

/** Oda ayarlarının tek satırlık özeti. */
function settingsText(s) {
  const parts = [MODE[s.mode]?.name, s.style === 'race' ? `Aynı anda · ${s.matchTime / 60} dk` : `Sırayla · ${s.turnTime} sn`];
  if (s.capacity > 2 || s.win === 'points') parts.push(WIN[s.win]);
  if (s.rounds > 1) parts.push(`${s.rounds} maçlık seri`);
  parts.push(s.hints ? 'İpucu açık' : 'İpucu kapalı');
  parts.push(s.reuse ? 'Aynı futbolcu tekrar olur' : 'Aynı futbolcu bir kez');
  return parts.join(' · ');
}

/* ───────── bağlantı */

const net = new Net({
  getHello: () => ({ ...(store.session() || {}), elo: store.stats().elo }),
  onCreds: (c) => store.setSession(c),
});

net.on('status', (st) => {
  netbar.hidden = st !== 'offline';
  if (st === 'offline') netbar.textContent = 'Bağlantı koptu, yeniden bağlanılıyor…';
  if (st === 'replaced') showReplaced();
});

net.on('welcome', (d) => {
  S.pid = d.pid;
  S.publicUrl = (d.publicUrl || location.origin).replace(/\/$/, '');
  S.db = d.db;
  S.welcomed = true;
  if (d.room) return setRoom(d.room);
  const wasIn = !!(S.room || S.queue);
  S.room = null;
  removeCountdown();
  if (d.queue) {
    S.queue = d.queue;
    return show('searching');
  }
  S.queue = null;
  if (wasIn && d.resumed === false) toast('Sunucu yeniden başladı; oda kapandı.', 'error', 4000);
  if (wasIn || current === 'boot' || current === 'lobby' || current === 'game' || current === 'searching') routeHome();
});

net.on('room', (m) => setRoom(m.room));
net.on('queue', (m) => {
  S.queue = m.queue;
  if (current === 'searching') view.update?.();
});
net.on('event', (e) => {
  switch (e.kind) {
    case 'joined':
      if (e.pid !== S.pid) toast(`${e.nick} odaya katıldı`);
      break;
    case 'left':
      toast(e.reason === 'timeout' ? `${e.nick} bağlantısı koptuğu için çıkarıldı` : e.reason === 'kicked' ? `${e.nick} çıkarıldı` : `${e.nick} odadan ayrıldı`);
      break;
    case 'host':
      toast(e.pid === S.pid ? '👑 Artık host sensin' : `👑 ${e.nick} artık host`);
      break;
    case 'renamed':
      toast(`Odada başka bir ${e.from} vardı; bu maçta adın ${e.nick}.`, 'info', 4500);
      break;
    case 'settings':
      if (S.room && S.room.hostPid !== S.pid) toast('Host oda ayarlarını değiştirdi');
      break;
    case 'closed':
      if (e.reason === 'idle') toast('Oda uzun süre boşta kaldığı için kapandı.');
      break;
    case 'removed':
    case 'error':
      toast(e.message, 'error', 5000);
      break;
    case 'log':
      view?.onLog?.(e.entry);
      break;
    default:
      break;
  }
});

document.addEventListener('visibilitychange', () => !document.hidden && net.poke());
window.addEventListener('online', () => net.poke());

/* ───────── ekran yönetimi */

let view = null;
let current = null;

function show(name, props = {}) {
  const key =
    name === 'game' ? `game:${S.room.code}:${S.room.round}` : name === 'lobby' ? `lobby:${S.room.code}` : `${name}:${JSON.stringify(props)}`;
  if (view && view.key === key) return view;
  view?.destroy?.();
  view = SCREENS[name](props);
  view.key = key;
  current = name;
  app.dataset.screen = name;
  app.replaceChildren(view.el);
  window.scrollTo(0, 0);
  view.focus?.();
  return view;
}

function routeHome() {
  if (S.routeCode) show('invite', { code: S.routeCode });
  else {
    setPath('/');
    show('home');
  }
}

function setRoom(room) {
  const prev = S.room;
  S.room = room;
  if (!room) {
    removeCountdown();
    if (prev && (current === 'lobby' || current === 'game')) {
      setPath('/');
      show('home');
    }
    return;
  }
  S.queue = null;
  S.routeCode = null;
  S.watching = !room.members.some((m) => m.pid === S.pid); // üye değilsem izleyiciyim
  setPath('/oda/' + room.code);
  if (room.status === 'finished' && room.game?.result) recordResult(room);
  const gameView = room.game && (room.status === 'playing' || room.status === 'finished' || (room.status === 'countdown' && current === 'game'));
  show(gameView ? 'game' : 'lobby');
  view.update?.(room);
  countdown(room);
}

function recordResult(room) {
  const id = `${room.code}:${room.round}`;
  if (id in S.records) return;
  const elos = Object.fromEntries(room.members.map((m) => [m.pid, m.elo ?? 1000]));
  S.records[id] = store.record(id, room.game.result, S.pid, elos);
}

async function leaveRoom({ forfeit = false } = {}) {
  const r = S.room;
  const watching = S.watching;
  if (!watching && forfeit && r?.game && !r.game.over && r.game.players.some((p) => p.pid === S.pid)) store.forfeit(`${r.code}:${r.round}`);
  try {
    await net.request(watching ? 'room/unwatch' : 'room/leave');
  } catch {
    /* bağlantı yoksa sunucu zaten süre dolunca çıkarır */
  }
  S.watching = false;
  S.room = null;
  removeCountdown();
  setPath('/');
  show('home');
}

/** İzleyici olarak odaya bak: oda dolu ya da maç başlamış olsa da ızgarayı canlı görürsün. */
async function watchRoom(code, err) {
  try {
    await net.request('room/watch', { code });
    S.watching = true;
    toast('İzleyicisin: maçı görürsün, cevap veremezsin.', 'info', 3500);
  } catch (e) {
    if (err) err.textContent = e.message;
    else toast(e.message, 'error');
  }
}

async function joinQueue(size) {
  try {
    const r = await net.request('queue/join', { size, nick: store.nick() });
    S.room = null;
    removeCountdown();
    if (r.queue) {
      S.queue = r.queue;
      setPath('/');
      show('searching');
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function attemptJoin(code, nick, err, btn) {
  btn.disabled = true;
  try {
    await net.request('room/join', { code, nick });
  } catch (e) {
    err.replaceChildren(h('span', {}, e.message));
    if (e.code === 'nick_taken' && e.suggestion) {
      err.append(' ', h('button', { class: 'link', on: { click: () => attemptJoin(code, e.suggestion, err, btn) } }, `"${e.suggestion}" deneyebilirsin.`));
    }
  } finally {
    btn.disabled = false;
  }
}

/* ───────── ortak parçalar */

function Logo(size = 'big') {
  return h('div', { class: `logo ${size}` }, gridGlyph(size === 'big' ? 62 : 28), h('div', { class: 'wm' }, h('span', {}, 'FOOTBALL'), h('span', {}, 'GRID')));
}

function Back() {
  return h('button', { class: 'back', on: { click: () => { setPath('/'); show('home'); } } }, '← Geri');
}

function Ticket(code, onClick) {
  return h(
    onClick ? 'button' : 'div',
    { class: 'ticket', ...(onClick ? { on: { click: onClick }, 'aria-label': `Oda kodu ${code}. Kopyalamak için dokun.` } : {}) },
    h('span', { class: 'tk-label' }, 'ODA KODU'),
    h('span', { class: 'tk-code' }, code),
  );
}

function localNickError(n) {
  const t = n.trim().replace(/\s+/g, ' ');
  const len = [...t].length;
  if (len < 3) return 'Takma ad en az 3 karakter olmalı.';
  if (len > 16) return 'Takma ad en fazla 16 karakter olabilir.';
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(t)) return 'Takma adda yalnızca harf, rakam, boşluk ve _ . - kullanılabilir.';
  return null;
}

function nickInput(id) {
  return h('input', {
    id, class: 'input nick', maxlength: 16, placeholder: 'Örn. Eren', autocomplete: 'nickname',
    autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'go', value: store.nick(),
  });
}

async function checkNick(input, err) {
  const bad = (msg) => {
    err.textContent = msg;
    input.classList.add('bad');
    input.focus();
    return null;
  };
  const local = localNickError(input.value);
  if (local) return bad(local);
  try {
    const r = await net.request('nick/check', { nick: input.value });
    input.classList.remove('bad');
    err.textContent = '';
    input.value = r.nick;
    store.setNick(r.nick);
    return r.nick;
  } catch (e) {
    return bad(e.message);
  }
}

/** Oda ayarları formu — oda kurarken ve lobide (host) aynı bileşen. */
function SettingsForm(init = {}, { minCapacity = 2 } = {}) {
  const st = { capacity: 2, mode: 'klasik', turnTime: 30, win: 'line3', style: 'turn', matchTime: 180, rounds: 1, hints: true, reuse: false, ...init };
  const uid = Math.random().toString(36).slice(2, 7); // aynı sayfada iki form olursa radio adları çakışmasın
  const note = h('p', { class: 'hint center' });
  const boxes = {};
  const update = () => {
    const size = st.mode === 'hizli' || st.capacity === 2 ? 3 : 4;
    const line = st.win === 'line3' || (st.capacity === 2 && st.win !== 'points');
    const tempo = st.style === 'race' ? `aynı anda, ${st.matchTime / 60} dk` : `sırayla, tur ${st.turnTime} sn`;
    const rule = st.win === 'points'
      ? 'en yüksek nadirlik puanı kazanır'
      : line
        ? 'yan yana 3 hücre kapan kazanır, üçleyen yoksa berabere'
        : 'en çok hücre kapan kazanır';
    note.textContent = `${size}×${size} ızgara · ${rule} · ${tempo}${st.rounds > 1 ? ` · ${st.rounds} maçlık seri` : ''}`;
    // 2 kişide "en çok hücre" kapalı: ilk başlayan bir hücre fazla alır, bilgi eşitse otomatik kazanırdı
    for (const i of boxes.win.querySelectorAll('input')) i.disabled = st.capacity === 2 && i.value === 'most';
    boxes.turnTime.hidden = st.style !== 'turn';
    boxes.matchTime.hidden = st.style !== 'race';
    for (const [key, box] of Object.entries(boxes)) for (const i of box.querySelectorAll('input')) i.checked = String(st[key]) === i.value;
  };
  const group = (title, key, opts) =>
    (boxes[key] = h('fieldset', { class: 'group' }, h('legend', { class: 'label' }, title),
      h('div', { class: `chips k-${key}` }, opts.map(([v, label, desc, disabled]) =>
        h('label', { class: 'chip' },
          h('input', {
            type: 'radio', name: `${key}-${uid}`, value: String(v), disabled: !!disabled,
            on: { change: () => { st[key] = v; if (key === 'capacity' && st.win !== 'points') st.win = v === 4 ? 'most' : 'line3'; update(); } },
          }),
          h('span', { class: 'chip-body' }, h('b', {}, label), desc ? h('small', {}, desc) : null))))));
  const el = h('div', { class: 'settings-form' },
    group('Oyuncu sayısı', 'capacity', [2, 3, 4].map((n) => [n, `${n} Kişi`, null, n < minCapacity])),
    group('Oyun modu', 'mode', Object.entries(MODE).map(([k, m]) => [k, m.name, m.desc])),
    group('Oyun tarzı', 'style', [
      ['turn', 'Sırayla', 'Sırası gelen tek hamle yapar'],
      ['race', 'Aynı anda', 'Sıra yok; hücreyi ilk doğru bilen kapar, yanlışa 3 sn ceza'],
    ]),
    group('Tur süresi', 'turnTime', [[15, '15 sn'], [30, '30 sn'], [45, '45 sn'], [60, '60 sn']]),
    group('Maç süresi', 'matchTime', [[60, '1 dk'], [120, '2 dk'], [180, '3 dk'], [300, '5 dk']]),
    group('Kazanma şekli', 'win', [
      ['line3', "3'leme", 'Yan yana 3 hücre (yatay, dikey ya da çapraz) kapan kazanır; kimse üçleyemezse berabere'],
      ['most', 'En çok hücre', 'Izgara dolunca ya da süre bitince en çok hücresi olan kazanır'],
      ['points', 'Nadirlik puanı', 'Az bilinen doğru cevap daha çok puan getirir; en yüksek puan kazanır'],
    ]),
    group('Maç sayısı', 'rounds', [
      [1, 'Tek maç'],
      [3, '3 maçlık seri', 'Turnuva: en çok maçı kazanan şampiyon'],
      [5, '5 maçlık seri', 'Turnuva: en çok maçı kazanan şampiyon'],
    ]),
    group('İpucu', 'hints', [[true, 'Açık', 'Maç başına 1 ipucu'], [false, 'Kapalı', 'İpucu yok']]),
    group('Aynı futbolcu', 'reuse', [[false, 'Bir kez', 'Her futbolcu maçta bir kez'], [true, 'Tekrar olur', 'Birden çok hücrede kullanılabilir']]),
    note);
  update();
  return { el, get: () => ({ ...st }) };
}

function Footer() {
  const st = store.stats();
  return h(
    'footer',
    { class: 'foot' },
    h('button', { class: 'link', on: { click: showStats } }, st.matches ? `${st.matches} maç · ${st.wins}G ${st.draws}B ${st.losses}M · ELO ${st.elo}` : `ELO ${st.elo} · henüz maç yok`),
    h('span', { 'aria-hidden': 'true' }, '·'),
    h('button', { class: 'link', on: { click: showRules } }, 'Nasıl oynanır?'),
  );
}

function showStats() {
  const st = store.stats();
  const acc = st.correct + st.wrong ? Math.round((st.correct * 100) / (st.correct + st.wrong)) : null;
  const rows = [
    ['Toplam maç', st.matches], ['Galibiyet', st.wins], ['Beraberlik', st.draws], ['Mağlubiyet', st.losses],
    ['Doğru cevap', st.correct], ['Yanlış cevap', st.wrong], ['İsabet', acc === null ? '—' : `%${acc}`], ['ELO', st.elo],
  ];
  let armed = false;
  modal(
    'İSTATİSTİKLERİN',
    h('div', {}, h('dl', { class: 'stats' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])),
      h('p', { class: 'hint' }, 'Hesap olmadığı için istatistikler yalnızca bu cihazda, bu tarayıcıda tutulur.')),
    {
      actions: [
        (close) => {
          const b = h('button', { class: 'btn ghost small' }, 'SIFIRLA');
          b.addEventListener('click', () => {
            if (!armed) {
              armed = true;
              b.textContent = 'EMİN MİSİN?';
              return;
            }
            store.resetStats();
            close();
            document.querySelector('.foot')?.replaceWith(Footer());
            toast('İstatistikler sıfırlandı');
          });
          return b;
        },
        (close) => h('button', { class: 'btn small', on: { click: close } }, 'TAMAM'),
      ],
    },
  );
}

/** Bot seviyesi seçtirir (lobide ve kuyrukta). */
function askBotLevel(pick) {
  const btn = (level, label, cls) => (close) =>
    h('button', { class: `btn ${cls} small`, on: { click: () => { close(); pick(level); } } }, label);
  modal(
    'BOT SEVİYESİ',
    h('p', {}, 'Kolay yalnız çok tanınmış futbolcuları bilir, yavaş oynar. Orta dengelidir. Zor derin listeden seçer, kazanan ya da engelleyen hücreyi kaçırmaz.'),
    { actions: [btn('kolay', 'KOLAY', 'ghost'), btn('orta', 'ORTA', 'ghost'), btn('zor', 'ZOR', 'primary')] },
  );
}

function showRules() {
  modal(
    'NASIL OYNANIR?',
    h('div', { class: 'rules' },
      h('ol', {},
        h('li', {}, 'Her hücre, satırındaki ve sütunundaki iki şartın kesişimidir. ', h('b', {}, 'Galatasaray × Brezilya uyruklu'), " → Galatasaray'da oynamış Brezilyalı bir futbolcu."),
        h('li', {}, 'Hücre seç, futbolcunun adını yaz ve listeden seç. Doğruysa hücre senin rengine boyanır.'),
        h('li', {}, "Başlıklar ne istediğini söyler: \"Claudio Ranieri / ile çalıştı\", \"Şampiyonlar Ligi / kazandı\", \"Premier Lig'de / oynadı\", \"GS · FB · BJK / en az ikisinde oynadı\"."),
        h('li', {}, "2 kişide ve 3'leme kuralında yan yana (yatay, dikey ya da çapraz) 3 hücre kapan kazanır; 'En çok hücre' kuralında süre ya da hamleler bitince en çok hücresi olan."),
      ),
      h('h4', {}, 'OYUN TARZI'),
      h('ul', { class: 'modes' },
        h('li', {}, h('b', {}, 'Sırayla'), ' — sırası gelen tek hamle yapar; yanlış, pas ya da süre bitince sıra geçer.'),
        h('li', {}, h('b', {}, 'Aynı anda'), ' — sıra yok; herkes istediği hücreye cevap verir, ilk doğru bilen kapar. Yanlış cevap 3 sn ceza.')),
      h('h4', {}, 'MODLAR VE AYARLAR'),
      h('ul', { class: 'modes' },
        Object.values(MODE).map((m) => h('li', {}, h('b', {}, m.name), ' — ', m.desc)),
        h('li', {}, h('b', {}, 'İpucu'), ' — açıksa maç başına 1 kez: yakın dönemden olası bir cevabın uyruğu, mevkisi ve yaşı.'),
        h('li', {}, h('b', {}, 'Aynı futbolcu'), ' — "bir kez" seçiliyse bir futbolcu maçta yalnızca bir hücrede kullanılır.')),
      h('p', { class: 'hint' },
        `Veri: Wikidata'daki kariyer geçmişleri${S.db ? ` (${S.db.players.toLocaleString('tr-TR')} futbolcu)` : ''} ve güncel kadrolar. ` +
          'Maç bitince hücreye dokun: oyuncu kartını ve diğer olası cevapları gör.'),
    ),
  );
}

/* ───────── ekranlar */

function BootScreen() {
  return { el: h('section', { class: 'screen center boot' }, Logo(), h('p', { class: 'lead' }, 'Bağlanıyor…')) };
}

function HomeScreen() {
  const input = nickInput('nick');
  const err = h('p', { class: 'err', role: 'alert' });
  let busy = false;
  const go = (target) => async () => {
    if (busy) return;
    busy = true;
    const n = await checkNick(input, err);
    busy = false;
    if (n) show(target);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go('quick')();
    }
  });
  input.addEventListener('input', () => {
    err.textContent = '';
    input.classList.remove('bad');
  });
  const el = h(
    'section',
    { class: 'screen home' },
    h('header', { class: 'cover' }, Logo(), h('p', { class: 'slogan' }, 'Futbol Bilginle Meydan Oku.')),
    h('div', { class: 'card field' },
      h('label', { class: 'label', for: 'nick' }, 'TAKMA ADIN'), input, err,
      h('p', { class: 'hint' }, 'Hesap yok, şifre yok, e-posta yok. Sadece bir takma ad.')),
    h('button', { class: 'btn primary big', on: { click: go('quick') } }, 'OYNA'),
    h('div', { class: 'row2' },
      h('button', { class: 'btn', on: { click: go('join') } }, 'ODAYA KATIL'),
      h('button', { class: 'btn', on: { click: go('create') } }, 'ODA OLUŞTUR')),
    Footer(),
  );
  return { el, focus: () => !input.value && fine() && input.focus() };
}

function QuickScreen() {
  const badges = {};
  const card = (n) => {
    badges[n] = h('span', { class: 'wait' }, ' ');
    return h('button', { class: 'size-card card', on: { click: () => joinQueue(n) } },
      h('span', { class: 'n' }, String(n)),
      h('span', { class: 'lbl' }, 'KİŞİLİK HIZLI MAÇ'),
      h('span', { class: 'desc' }, n === 2 ? '3×3 ızgara · yan yana 3 hücre kazanır' : n === 3 ? "4×4 ızgara · 3'leme: yan yana 3 hücre kazanır" : '4×4 ızgara · en çok hücre kapan kazanır'),
      badges[n]);
  };
  const refresh = () =>
    net.request('queue/counts').then((r) => {
      for (const n of [2, 3, 4]) badges[n].textContent = r.counts[n] ? `${r.counts[n]} kişi bekliyor` : 'Şu an bekleyen yok';
    }).catch(() => {});
  refresh();
  const iv = setInterval(refresh, 3000);
  const el = h('section', { class: 'screen' }, Back(),
    h('h2', { class: 'title' }, 'HIZLI MAÇ'),
    h('p', { class: 'lead' }, 'Kaç kişilik maç arıyorsun?'),
    h('div', { class: 'sizes' }, card(2), card(3), card(4)),
    h('p', { class: 'hint center' }, `Klasik mod · sırayla · 30 sn tur · ipucu açık · oynayan: ${store.nick()}`));
  return { el, destroy: () => clearInterval(iv) };
}

function SearchingScreen() {
  const q = () => S.queue || {};
  const sub = h('p', { class: 'lead' });
  const you = h('b');
  const waiting = h('b');
  const avg = h('b');
  const clock = h('b', {}, '00:00');
  const botsBox = h('div', { class: 'bots-offer', hidden: true },
    h('p', { class: 'hint center' }, 'Henüz yeterli rakip çıkmadı. İstersen botlarla başla, rakip gelirse onlar da alınır.'),
    h('button', { class: 'btn primary', on: { click: withBots } }, 'BOTLARLA BAŞLA'));
  const el = h('section', { class: 'screen center searching' },
    h('div', { class: 'radar', 'aria-hidden': 'true' }, h('span', { class: 'sweep' }), h('span', { class: 'ball' }, '⚽')),
    h('h2', { class: 'title' }, '🔎 Rakip aranıyor...'),
    sub,
    h('dl', { class: 'qstats card' },
      h('dt', {}, 'Sen'), h('dd', {}, you),
      h('dt', {}, 'Bekleyen oyuncular'), h('dd', {}, waiting),
      h('dt', {}, 'Ortalama bekleme'), h('dd', {}, avg),
      h('dt', {}, 'Geçen süre'), h('dd', {}, clock)),
    botsBox,
    h('button', { class: 'btn', on: { click: cancel } }, 'İPTAL'));
  function update() {
    const s = q();
    sub.textContent = `${s.size || ''} kişilik maç aranıyor...`;
    you.textContent = s.nick || store.nick();
    waiting.textContent = String(s.waiting ?? '—');
    avg.textContent = s.avgWaitSec ? `${s.avgWaitSec} sn` : 'hesaplanıyor…';
  }
  function tick() {
    const s = q();
    if (!s.since) return;
    const sec = Math.max(0, Math.floor((net.now() - s.since) / 1000));
    clock.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    botsBox.hidden = net.now() < s.botsAt;
  }
  async function cancel() {
    try {
      await net.request('queue/leave');
    } catch {
      /* yok say */
    }
    S.queue = null;
    show('quick');
  }
  function withBots() {
    askBotLevel(async (level) => {
      try {
        await net.request('queue/bots', { level });
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }
  update();
  tick();
  const iv = setInterval(tick, 500);
  return { el, update, destroy: () => clearInterval(iv) };
}

function CreateScreen() {
  const form = SettingsForm();
  const btn = h('button', { class: 'btn primary big', on: { click: submit } }, 'ODAYI OLUŞTUR');
  async function submit() {
    btn.disabled = true;
    try {
      await net.request('room/create', { nick: store.nick(), ...form.get() });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }
  const el = h('section', { class: 'screen' }, Back(), h('h2', { class: 'title' }, 'ODA OLUŞTUR'), form.el, btn);
  return { el };
}

function JoinScreen() {
  const input = h('input', {
    id: 'code', class: 'input code', maxlength: 64, placeholder: '7K4P9', autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'go', 'aria-describedby': 'code-err',
  });
  const err = h('div', { class: 'err', id: 'code-err', role: 'alert' });
  const btn = h('button', { class: 'btn primary big', on: { click: () => submit() } }, 'ODAYA KATIL');
  input.addEventListener('input', () => {
    const v = normCode(input.value);
    if (v !== input.value) input.value = v;
    err.replaceChildren();
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  async function submit() {
    const code = normCode(input.value);
    if (code.length < 5) {
      err.textContent = 'Oda kodu 5-6 karakter olmalı.';
      input.focus();
      return;
    }
    await attemptJoin(code, store.nick(), err, btn);
  }
  const el = h('section', { class: 'screen' }, Back(),
    h('h2', { class: 'title' }, 'ODAYA KATIL'),
    h('div', { class: 'card field' },
      h('label', { class: 'label', for: 'code' }, 'Oda kodunu gir'), input, err,
      h('p', { class: 'hint' }, 'Büyük/küçük harf fark etmez. Davet linkini de yapıştırabilirsin.')),
    btn);
  return { el, focus: () => input.focus() };
}

function InviteScreen({ code }) {
  const info = h('p', { class: 'lead center' }, 'Oda bilgisi alınıyor…');
  const input = nickInput('nick-inv');
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary big', on: { click: () => go() } }, 'ODAYA KATIL');
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  net.request('room/peek', { code })
    .then((p) => {
      info.textContent = `${p.host ? `Host: ${p.host} · ` : ''}${p.count}/${p.capacity} oyuncu · ${MODE[p.mode]?.name || p.mode} · ${p.turnTime} sn`;
      if (p.error) err.textContent = p.error.message;
      watchBtn.hidden = !(p.error && (p.error.code === 'full' || p.error.code === 'started'));
    })
    .catch((e) => {
      info.textContent = '';
      err.textContent = e.message;
      if (e.code === 'not_found' || e.code === 'closed') btn.disabled = true;
    });
  async function go() {
    const n = await checkNick(input, err);
    if (n) await attemptJoin(code, n, err, btn);
  }
  // Oda dolu ya da maç başlamışsa katılamazsın; izleyici olarak girebilirsin (oda bilgisi gelince görünür)
  const watchBtn = h('button', { class: 'btn', hidden: true, on: { click: () => watchRoom(code, err) } }, 'İZLEYİCİ OLARAK GİR');
  const el = h('section', { class: 'screen' },
    Logo('small'),
    h('h2', { class: 'title' }, 'ODAYA DAVET'),
    Ticket(code),
    info,
    h('div', { class: 'card field' }, h('label', { class: 'label', for: 'nick-inv' }, 'Takma adını gir'), input, err),
    btn,
    watchBtn,
    h('button', { class: 'link center', on: { click: () => { S.routeCode = null; setPath('/'); show('home'); } } }, 'Ana sayfaya dön'));
  return { el, focus: () => fine() && input.focus() };
}

function LobbyScreen() {
  const code = S.room.code;
  const list = h('ul', { class: 'players' });
  const count = h('span', { class: 'count' });
  const settings = h('p', { class: 'settings' });
  const foot = h('div', { class: 'lobby-foot' });
  const copyCode = async () => toast((await copyText(code)) ? 'Oda kodu kopyalandı' : 'Kopyalanamadı, kodu elle paylaş', 'ok');
  const copyLink = async () => toast((await copyText(inviteLink(code))) ? 'Davet linki kopyalandı' : 'Kopyalanamadı', 'ok');

  function showQr() {
    const link = inviteLink(code);
    const lan = /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(link);
    const local = /^http:\/\/(localhost|127\.)/.test(link);
    modal('QR KOD',
      h('div', { class: 'qr-box' }, qrSvg(link), h('p', { class: 'mono' }, link),
        lan ? h('p', { class: 'hint' }, 'Telefon bu bilgisayarla aynı Wi-Fi ağında olmalı.') : null,
        local ? h('p', { class: 'hint' }, 'Bu bağlantı yalnızca bu bilgisayarda açılır. Telefonla katılmak için sunucuyu ağ adresiyle aç.') : null),
      { actions: [() => h('button', { class: 'btn small', on: { click: copyLink } }, 'LİNKİ KOPYALA')] });
  }

  function editSettings() {
    const room = S.room;
    const form = SettingsForm(room.settings, { minCapacity: room.members.length });
    modal('ODA AYARLARI', h('div', {}, form.el), {
      actions: [
        (close) => h('button', { class: 'btn small', on: { click: close } }, 'VAZGEÇ'),
        (close) => h('button', {
          class: 'btn primary small',
          on: {
            click: async () => {
              try {
                await net.request('room/settings', { settings: form.get() });
                close();
                toast('Ayarlar kaydedildi', 'ok');
              } catch (e) {
                toast(e.message, 'error');
              }
            },
          },
        }, 'KAYDET'),
      ],
    });
  }

  const el = h('section', { class: 'screen lobby' },
    h('div', { class: 'topbar' }, Logo('small'), h('button', { class: 'link', on: { click: () => leaveRoom() } }, 'Odadan çık')),
    Ticket(code, copyCode),
    h('p', { class: 'hint center' }, 'Oda kodunu arkadaşlarınla paylaş.'),
    h('div', { class: 'row2' },
      h('button', { class: 'btn', on: { click: copyCode } }, 'KODU KOPYALA'),
      h('button', { class: 'btn', on: { click: copyLink } }, 'DAVET LİNKİNİ KOPYALA')),
    h('button', { class: 'btn small qr-btn', on: { click: showQr } }, h('span', { 'aria-hidden': 'true' }, '▦'), 'QR KOD'),
    h('div', { class: 'card roster' },
      h('div', { class: 'roster-head' }, h('h3', {}, 'ODADAKİ OYUNCULAR'), count),
      list,
      settings),
    foot);

  function update(room) {
    const me = S.pid;
    const isHost = room.hostPid === me;
    const free = room.settings.capacity - room.members.length;
    count.textContent = `${room.members.length} / ${room.settings.capacity}`;
    list.replaceChildren(
      ...room.members.map((m) =>
        h('li', { class: `pl${m.online ? '' : ' off'}`, dataset: { color: m.color } },
          h('span', { class: 'dot' }),
          h('span', { class: 'nick' }, m.nick),
          m.host ? h('span', { class: 'crown', title: 'Host', 'aria-label': 'Host' }, '👑') : null,
          m.pid === me ? h('span', { class: 'you' }, 'SEN') : null,
          m.bot ? h('span', { class: 'tag' }, m.level ? `BOT · ${m.level.toLocaleUpperCase('tr')}` : 'BOT') : null,
          m.online ? null : h('span', { class: 'tag' }, 'bağlantı yok'),
          isHost && m.bot
            ? h('button', { class: 'icon-btn tiny', 'aria-label': `${m.nick} botunu çıkar`, on: { click: () => net.request('room/removeBot', { pid: m.pid }).catch((e) => toast(e.message, 'error')) } }, '✕')
            : null)),
      ...Array.from({ length: Math.max(0, free) }, () => h('li', { class: 'pl empty' }, h('span', { class: 'dot' }), h('span', { class: 'nick' }, 'Oyuncu bekleniyor...'))),
    );
    settings.textContent = settingsText(room.settings);
    if (isHost) {
      const can = room.members.length >= 2;
      put(foot,
        h('button', { class: 'btn primary big', disabled: !can || room.status !== 'lobby', on: { click: () => net.request('room/start').catch((e) => toast(e.message, 'error')) } }, 'MAÇI BAŞLAT'),
        h('p', { class: 'hint center' }, !can ? 'Başlatmak için en az 2 oyuncu gerekli.' : free > 0 ? 'Oda dolmadan da başlatabilirsin.' : 'Herkes hazır.'),
        h('div', { class: 'row2' },
          h('button', { class: 'btn ghost small', on: { click: editSettings } }, 'AYARLAR'),
          free > 0
            ? h('button', {
                class: 'btn ghost small',
                on: { click: () => askBotLevel((level) => net.request('room/addBot', { level }).catch((e) => toast(e.message, 'error'))) },
              }, '+ BOT EKLE')
            : h('span')),
      );
    } else {
      put(foot, h('p', { class: 'waiting' }, "Host'un maçı başlatması bekleniyor", h('span', { class: 'dots' }, '...')));
    }
  }
  return { el, update };
}

function showReplaced() {
  view?.destroy?.();
  removeCountdown();
  view = {
    key: 'replaced',
    el: h('section', { class: 'screen center' }, Logo('small'),
      h('h2', { class: 'title' }, 'BAŞKA SEKMEDE AÇIK'),
      h('p', { class: 'lead' }, 'FOOTBALLGRID bu tarayıcıda başka bir sekmede açıldı. Aynı oyuncu iki yerde birden oynayamaz.'),
      h('button', { class: 'btn primary', on: { click: () => { current = 'boot'; net.connect(); } } }, 'BURADA DEVAM ET')),
  };
  current = 'replaced';
  app.dataset.screen = 'replaced';
  app.replaceChildren(view.el);
}

/* ───────── geri sayım katmanı */

let cd = null;
function countdown(room) {
  if (room.status !== 'countdown') return removeCountdown();
  if (!cd) {
    const num = h('div', { class: 'cd-num' });
    const players = h('ul', { class: 'cd-players' });
    const title = room.quick && room.round === 0 ? 'RAKİPLER BULUNDU!' : room.round > 0 ? 'RÖVANŞ BAŞLIYOR' : 'MAÇ BAŞLIYOR';
    const sub = h('p', { class: 'cd-sub' }, settingsText(room.settings));
    const el = h('div', { class: 'countdown', role: 'status' }, h('p', { class: 'cd-title' }, title), num, players, sub);
    document.body.append(el);
    cd = { el, num, players, last: null, room, iv: setInterval(cdTick, 100) };
  }
  cd.room = room;
  cd.players.replaceChildren(...room.members.map((m) => h('li', { dataset: { color: m.color } }, h('span', { class: 'dot' }), m.nick)));
  cdTick();
}
function cdTick() {
  if (!cd) return;
  const left = Math.max(1, Math.ceil((cd.room.startsAt - net.now()) / 1000));
  if (left === cd.last) return;
  cd.last = left;
  cd.num.textContent = String(left);
  cd.num.classList.remove('pop');
  void cd.num.offsetWidth;
  cd.num.classList.add('pop');
}
function removeCountdown() {
  if (!cd) return;
  clearInterval(cd.iv);
  cd.el.remove();
  cd = null;
}

/* ───────── başlat */

const SCREENS = {
  boot: BootScreen,
  home: HomeScreen,
  quick: QuickScreen,
  searching: SearchingScreen,
  create: CreateScreen,
  join: JoinScreen,
  invite: InviteScreen,
  lobby: LobbyScreen,
  game: () =>
    GameScreen({
      net,
      S,
      recordFor: (room) => S.records[`${room.code}:${room.round}`] || null,
      leave: (opts) => leaveRoom(opts),
      requeue: (n) => joinQueue(n),
    }),
};

if (store.session()) {
  show('boot');
  setTimeout(() => current === 'boot' && routeHome(), 3500);
} else {
  routeHome();
}
net.connect();
