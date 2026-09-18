/* DOM yardımcıları ve çizimler: arma, bayrak, forma, QR, bildirim, pencere.
   Kullanıcıdan gelen her metin textContent ile basılır — innerHTML yok. */

export const COLOR_HEX = { blue: '#2563eb', red: '#e0362c', green: '#15964f', yellow: '#f2b705' };

const SVGNS = 'http://www.w3.org/2000/svg';

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k === 'hidden' || k === 'disabled' || k === 'checked') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

/** replaceChildren gibi, ama null/false atlanır (DOM'un kendisi bunları "null" metni olarak basar). */
export function put(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

/** En uzun kelimenin harf sayısı → CSS --len (yazı kutuya sığsın diye küçülür). */
export function fit(el, text) {
  el.style.setProperty('--len', String(Math.max(4, ...String(text).split(/\s+/).map((w) => [...w].length))));
  return el;
}

export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) el.setAttribute(k, v);
  append(el, kids);
  return el;
}

/* ───────── bildirim ve pencere */

export function toast(text, kind = 'info', ms = 2800) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);
  box.append(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 250);
  }, ms);
}

export function modal(title, body, { actions = [], onClose } = {}) {
  const before = document.activeElement;
  const onKey = (e) => e.key === 'Escape' && close();
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
    before?.focus?.({ preventScroll: true });
  };
  const box = h(
    'div',
    { class: 'modal card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Kapat', on: { click: () => close() } }, '✕')),
    body,
    actions.length ? h('div', { class: 'modal-actions' }, actions.map((a) => (typeof a === 'function' ? a(close) : a))) : null,
  );
  const wrap = h('div', { class: 'modal-wrap', on: { pointerdown: (e) => e.target === wrap && close() } }, box);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  (box.querySelector('.modal-actions button') || box.querySelector('button'))?.focus();
  return close;
}

/** Pano API'si yalnızca güvenli bağlamda (https / localhost) var; Wi-Fi'deki http için yedek yol. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* yedeğe düş */
  }
  const ta = h('textarea', { readonly: '', 'aria-hidden': 'true', class: 'offscreen' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/* ───────── QR (vendored qrcode-generator, kendi SVG çizimimiz) */

export function qrSvg(text, px = 232) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 3;
  const dim = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return s(
    'svg',
    { viewBox: `0 0 ${dim} ${dim}`, width: px, height: px, class: 'qr', role: 'img', 'aria-label': 'Oda bağlantısının QR kodu', 'shape-rendering': 'crispEdges' },
    s('rect', { width: dim, height: dim, fill: '#ffffff' }),
    s('path', { d, fill: '#14203a' }),
  );
}

/* ───────── arma / bayrak / forma */

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

let uid = 0;
const SHIELD = 'M20 2.5 L36.5 7 V21.5 C36.5 32.5 29 39.5 20 43.5 C11 39.5 3.5 32.5 3.5 21.5 V7 Z';

/** Telifli armalar yerine kulüp renklerinden monogram kalkan. */
export function crest(cat, px = 32) {
  const [a, b] = cat.colors || ['#8a8f9c', '#ffffff'];
  const text = cat.short || cat.name.slice(0, 3).toUpperCase();
  const id = 'cr' + ++uid;
  const fs = text.length >= 4 ? 9.4 : text.length === 3 ? 11.2 : 13.5;
  return s(
    'svg',
    { viewBox: '0 0 40 46', width: px, height: Math.round((px * 46) / 40), class: 'crest', 'aria-hidden': 'true' },
    s('defs', {}, s('clipPath', { id }, s('path', { d: SHIELD }))),
    s(
      'g',
      { 'clip-path': `url(#${id})` },
      s('rect', { width: 40, height: 46, fill: a }),
      s('path', { d: 'M0 31 L20 38.5 L40 31 V46 H0 Z', fill: b }),
      s('rect', { width: 40, height: 5, fill: b }),
    ),
    s('path', { d: SHIELD, fill: 'none', stroke: '#14203a', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
    s('text', {
      x: 20, y: 22.5, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: luminance(a) > 0.42 ? '#14203a' : '#ffffff',
      'font-size': fs, 'font-weight': 900, 'font-family': 'Archivo, system-ui, sans-serif', 'font-stretch': '75%',
    }, text),
  );
}

function starPath(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

/** Bayrak mini-dili: "h:#a,#b:2" şeritler, "bg:#c" düz zemin, "|katman:renk" üst katmanlar. */
export function flag(spec, px = 30) {
  const [base, ...layers] = String(spec || 'bg:#cccccc').split('|');
  const kids = [];
  const kind = base.slice(0, base.indexOf(':'));
  const rest = base.slice(base.indexOf(':') + 1);
  let bg = '#cccccc';
  if (kind === 'bg') {
    bg = rest;
    kids.push(s('rect', { width: 30, height: 20, fill: bg }));
  } else {
    const stripes = rest.split(',').map((x) => {
      const [c, w] = x.split(':');
      return [c, Number(w || 1)];
    });
    const total = stripes.reduce((n, [, w]) => n + w, 0);
    let at = 0;
    bg = stripes[0][0];
    for (const [c, w] of stripes) {
      const len = ((kind === 'h' ? 20 : 30) * w) / total;
      kids.push(kind === 'h' ? s('rect', { x: 0, y: at, width: 30, height: len + 0.05, fill: c }) : s('rect', { x: at, y: 0, width: len + 0.05, height: 20, fill: c }));
      at += len;
    }
  }
  for (const layer of layers) {
    const i = layer.indexOf(':');
    const k = i < 0 ? layer : layer.slice(0, i);
    const [c1, c2] = i < 0 ? [] : layer.slice(i + 1).split(',');
    switch (k) {
      case 'dot': kids.push(s('circle', { cx: 15, cy: 10, r: 3.3, fill: c1 })); break;
      case 'bigdot': kids.push(s('circle', { cx: 15, cy: 10, r: 6, fill: c1 })); break;
      case 'star': kids.push(s('path', { d: starPath(15, 10.3, 4.2), fill: c1 })); break;
      case 'cross': kids.push(s('rect', { x: 0, y: 7.8, width: 30, height: 4.4, fill: c1 }), s('rect', { x: 12.8, y: 0, width: 4.4, height: 20, fill: c1 })); break;
      case 'saltire': kids.push(s('path', { d: 'M0 0L30 20M30 0L0 20', stroke: c1, 'stroke-width': 3.6 })); break;
      case 'nordic': kids.push(s('rect', { x: 0, y: 7.8, width: 30, height: 4.4, fill: c1 }), s('rect', { x: 8.6, y: 0, width: 4.4, height: 20, fill: c1 })); break;
      case 'nordic2':
        kids.push(
          s('rect', { x: 0, y: 7, width: 30, height: 6, fill: c1 }), s('rect', { x: 8, y: 0, width: 6, height: 20, fill: c1 }),
          s('rect', { x: 0, y: 8.6, width: 30, height: 2.8, fill: c2 }), s('rect', { x: 9.6, y: 0, width: 2.8, height: 20, fill: c2 }),
        );
        break;
      case 'canton': kids.push(s('rect', { x: 0, y: 0, width: 12, height: 10.8, fill: c1 })); break;
      case 'cdot': kids.push(s('circle', { cx: 6, cy: 5.4, r: 2.6, fill: c1 })); break;
      case 'cstar': kids.push(s('path', { d: starPath(6, 5.6, 2.8), fill: c1 })); break;
      case 'ccross': kids.push(s('rect', { x: 0, y: 4.3, width: 12, height: 2.2, fill: c1 }), s('rect', { x: 4.9, y: 0, width: 2.2, height: 10.8, fill: c1 })); break;
      case 'crescent':
        kids.push(
          s('circle', { cx: 12, cy: 10, r: 5.4, fill: c1 }),
          s('circle', { cx: 13.4, cy: 10, r: 4.3, fill: bg }),
          s('path', { d: starPath(18.4, 10, 2.6), fill: c1, transform: 'rotate(-18 18.4 10)' }),
        );
        break;
      case 'rhombus': kids.push(s('path', { d: 'M3 10L15 2.6L27 10L15 17.4Z', fill: c1 })); break;
      case 'swiss': kids.push(s('rect', { x: 13, y: 4, width: 4, height: 12, fill: c1 }), s('rect', { x: 9, y: 8, width: 12, height: 4, fill: c1 })); break;
      case 'tri': kids.push(s('path', { d: 'M0 0L14 10L0 20Z', fill: c1 })); break;
      case 'diag': kids.push(s('path', { d: 'M0 20L0 15L24 0H30V5L6 20Z', fill: c1 })); break;
      case 'yinyang': kids.push(s('path', { d: 'M9.5 10a5.5 5.5 0 0 1 11 0Z', fill: c1 }), s('path', { d: 'M9.5 10a5.5 5.5 0 0 0 11 0Z', fill: c2 })); break;
      default: break;
    }
  }
  return s(
    'svg',
    { viewBox: '0 0 30 20', width: px, height: Math.round((px * 2) / 3), class: 'flag', 'aria-hidden': 'true' },
    ...kids,
    s('rect', { x: 0.6, y: 0.6, width: 28.8, height: 18.8, rx: 1.2, fill: 'none', stroke: '#14203a', 'stroke-width': 1.2 }),
  );
}

const JERSEY_NO = { 'pos:gk': '1', 'pos:df': '4', 'pos:mf': '8', 'pos:fw': '9' };

export function jersey(key, px = 32) {
  const gk = key === 'pos:gk';
  return s(
    'svg',
    { viewBox: '0 0 40 40', width: px, height: px, class: 'jersey', 'aria-hidden': 'true' },
    s('path', {
      d: 'M13 4 L7 7 L2 15 L8 18.5 L10 16 V36 H30 V16 L32 18.5 L38 15 L33 7 L27 4 C25.5 7 23 8.5 20 8.5 C17 8.5 14.5 7 13 4 Z',
      fill: gk ? '#f2b705' : '#fbf8f1', stroke: '#14203a', 'stroke-width': 2.2, 'stroke-linejoin': 'round',
    }),
    s('text', {
      x: 20, y: 24, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#14203a',
      'font-size': 14, 'font-weight': 900, 'font-family': 'Archivo, system-ui, sans-serif',
    }, JERSEY_NO[key] || '?'),
  );
}

function trophy(label, px) {
  const ink = { stroke: '#14203a', 'stroke-width': 2.2, 'stroke-linejoin': 'round' };
  return s(
    'svg',
    { viewBox: '0 0 40 40', width: px, height: px, class: 'trophy', 'aria-hidden': 'true' },
    s('path', { d: 'M12 8H6c0 5 2.5 8.5 7 9.5M28 8h6c0 5-2.5 8.5-7 9.5', fill: 'none', ...ink, 'stroke-linecap': 'round' }),
    s('path', { d: 'M11 4.5h18v9.5c0 6-4 10-9 10s-9-4-9-10z', fill: '#f2b705', ...ink }),
    s('path', { d: 'M17 24h6v5h-6zM11.5 35.5c0-3.5 3.5-6.5 8.5-6.5s8.5 3 8.5 6.5z', fill: '#f2b705', ...ink }),
    label
      ? s('text', {
          x: 20, y: 13.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#14203a',
          'font-size': label.length > 2 ? 6.2 : 8, 'font-weight': 900, 'font-family': 'Archivo, system-ui, sans-serif',
        }, label)
      : null,
  );
}

/** Menajer: taktik tahtası. */
function tactics(px) {
  return s(
    'svg',
    { viewBox: '0 0 40 40', width: px, height: px, class: 'tactics', 'aria-hidden': 'true' },
    s('rect', { x: 4.5, y: 6, width: 31, height: 28, rx: 3.5, fill: '#15964f', stroke: '#14203a', 'stroke-width': 2.2 }),
    s('path', { d: 'M20 6v28', stroke: '#ffffff', 'stroke-width': 1.5, opacity: 0.75 }),
    s('circle', { cx: 20, cy: 20, r: 4.5, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, opacity: 0.75 }),
    s('path', { d: 'M9.5 11.5l4.5 4.5M14 11.5l-4.5 4.5', stroke: '#ffffff', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
    s('path', { d: 'M15 19c3.5 5.5 7.5 7.5 10.5 8', fill: 'none', stroke: '#f2b705', 'stroke-width': 1.8, 'stroke-dasharray': '2.2 2' }),
    s('circle', { cx: 28.5, cy: 27.5, r: 2.8, fill: 'none', stroke: '#f2b705', 'stroke-width': 2 }),
  );
}

// Her jokerin kendi kısa işareti — hepsi aynı yıldız olmasın
const WILD_GLYPH = {
  uclfinal: 'F', uclfinalgoal: 'FG', wcfinal: 'DKF', wcfinalgoal: 'DKG', uclwc: 'Ş+D', treble: '3',
  big3: '3L', big4: '4L', ucl3: '3×', lt3esp: 'LL', lt3eng: 'PL', lt3ita: 'SA', lt3ger: 'BL', lt3tr1: 'SL',
  derby: '3B', trforeign: 'YAB', trabroad: 'TR',
};

/** Joker (wildcard): kırmızı zeminde yıldız ya da jokerin kısa işareti. */
function joker(px, glyph) {
  return s(
    'svg',
    { viewBox: '0 0 40 40', width: px, height: px, class: 'joker', 'aria-hidden': 'true' },
    s('rect', { x: 5, y: 5, width: 30, height: 30, rx: 7, fill: '#e0362c', stroke: '#14203a', 'stroke-width': 2.2 }),
    glyph
      ? s('text', {
          x: 20, y: 20.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#ffffff',
          'font-size': glyph.length > 2 ? 10.5 : glyph.length > 1 ? 13.5 : 18,
          'font-weight': 900, 'font-family': 'Archivo, system-ui, sans-serif',
        }, glyph)
      : s('path', { d: starPath(20, 20.6, 10.5), fill: '#ffffff', stroke: '#14203a', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
  );
}

/** Boy: ölçü şeridi — eşik santimi + yön (üstü ▲ / altı ▼). */
function ruler(px, cm, over) {
  return s(
    'svg',
    { viewBox: '0 0 40 40', width: px, height: px, class: 'ruler', 'aria-hidden': 'true' },
    s('rect', { x: 4.5, y: 8, width: 31, height: 24, rx: 6, fill: '#2563eb', stroke: '#14203a', 'stroke-width': 2.2 }),
    s('path', { d: 'M12 12.5v15M9 12.5h6M9 27.5h6', stroke: '#ffffff', 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0.9 }),
    s('path', { d: over ? 'M12 13.5l3 4h-6z' : 'M12 26.5l3-4h-6z', fill: '#ffffff' }),
    s('text', {
      x: 25.5, y: 20.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#ffffff',
      'font-size': 12.5, 'font-weight': 900, 'font-family': 'Archivo, system-ui, sans-serif',
    }, String(cm)),
  );
}

export function catIcon(cat, px = 30) {
  if (cat.type === 'club') return crest(cat, px);
  if (cat.type === 'nat') return flag(cat.flag, px + 4);
  if (cat.type === 'lg') return h('span', { class: 'lg-badge' }, cat.short || cat.name);
  if (cat.type === 'cup') return trophy(cat.short, px);
  if (cat.type === 'mgr' || cat.type === 'mate') return tactics(px);
  if (cat.type === 'wild') return joker(px, WILD_GLYPH[String(cat.key || '').split(':')[1]]);
  if (cat.type === 'ht') return ruler(px, cat.cm, cat.over);
  return jersey(cat.key, px);
}

/** Başlığın açık, tek satırlık hâli: "Claudio Ranieri ile çalıştı", "Şampiyonlar Ligi kazandı". */
export const catLabel = (cat) => (cat.head ? cat.head.filter(Boolean).join(' ') : cat.name);

/** Izgara başlığı: simge + kalın ad + ne istendiğini söyleyen küçük fiil. */
export function catTile(cat) {
  const [main, verb] = cat.head || [cat.name, ''];
  return h(
    'div',
    { class: `hcat t-${cat.type}`, title: cat.desc || catLabel(cat) },
    catIcon(cat),
    fit(h('span', { class: 'hname' }, main), main),
    verb ? h('span', { class: 'hverb' }, verb) : null,
  );
}

/** Satır içi küçük başlık (cevap panelinde). */
export function catChip(cat) {
  return h('span', { class: `catchip t-${cat.type}` }, catIcon(cat, 20), h('span', {}, cat.desc || cat.name));
}

/** Oyuncu kartı: kulüpleri (yıllarıyla), uyruk, mevki, kupalar, hocalar, özellikler. */
export function playerCard(card) {
  const years = (c) => (c.from === null || c.from === undefined ? '' : `${c.from}–${c.to === 0 ? 'bugün' : c.to ?? '?'}`);
  const section = (title, body) => h('div', { class: 'pc-sec' }, h('p', { class: 'label' }, title), body);
  const age = card.by ? new Date().getFullYear() - card.by : null;
  const meta = [age ? `${age} yaşında` : null, card.ht ? (card.ht / 100).toFixed(2).replace('.', ',') + ' m' : null, card.pos?.length ? card.pos.join(', ') : null]
    .filter(Boolean)
    .join(' · ');
  return h(
    'div',
    { class: 'pcard' },
    h('div', { class: 'pc-head' },
      h('div', { class: 'pc-flags' }, card.nats.map((n) => h('span', { class: 'pc-nat' }, flag(n.flag, 24), n.name))),
      meta ? h('p', { class: 'pc-meta' }, meta) : null),
    card.clubs.length
      ? section('KULÜPLERİ (OYUNDAKİLER)', h('ul', { class: 'pc-clubs' }, card.clubs.map((c) =>
          h('li', {}, crest(c, 22), h('span', { class: 'nm' }, c.name), h('span', { class: 'yr' }, years(c))))))
      : null,
    card.cups.length ? section('KUPALARI', h('div', { class: 'pc-tags' }, card.cups.map((x) => h('span', { class: 'pc-tag cup' }, '🏆 ', x)))) : null,
    card.mgrs.length ? section('ÇALIŞTIĞI HOCALAR', h('p', { class: 'pc-list' }, card.mgrs.slice(0, 12).join(' · '))) : null,
    card.mates?.length ? section('TAKIM ARKADAŞLARI', h('p', { class: 'pc-list' }, card.mates.slice(0, 12).join(' · '))) : null,
    card.wild.length ? section('ÖZELLİKLERİ', h('div', { class: 'pc-tags' }, card.wild.map((x) => h('span', { class: 'pc-tag' }, x)))) : null,
    card.qid
      ? h('a', { class: 'pc-src', href: `https://www.wikidata.org/wiki/${card.qid}`, target: '_blank', rel: 'noopener noreferrer' }, 'Kaynak: Wikidata ↗')
      : h('p', { class: 'hint' }, 'Kaynak: 2026-27 güncel kadro verisi'),
  );
}

/** Logodaki 3×3 ızgara işareti. */
export function gridGlyph(px = 40) {
  const fill = { 0: COLOR_HEX.blue, 4: COLOR_HEX.red, 8: COLOR_HEX.blue, 5: COLOR_HEX.yellow };
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const x = (i % 3) * 13 + 1.5;
    const y = Math.floor(i / 3) * 13 + 1.5;
    cells.push(s('rect', { x, y, width: 11, height: 11, rx: 2.4, fill: fill[i] || 'none', stroke: '#14203a', 'stroke-width': 1.8 }));
  }
  return s('svg', { viewBox: '0 0 41 41', width: px, height: px, class: 'glyph', 'aria-hidden': 'true' }, ...cells);
}
