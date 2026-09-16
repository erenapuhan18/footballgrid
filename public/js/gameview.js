/* Maç ekranı: skor şeridi, sıra/süre, ızgara, cevap paneli (ipucu), akış, sonuç ve oyuncu kartı.
   İki tarz: sırayla (turn) ve aynı anda (race — sıra yok, ilk doğru bilen kapar, yanlışa 3 sn ceza). */

import { h, put, fit, toast, modal, catTile, catChip, gridGlyph, playerCard, flag, COLOR_HEX } from './ui.js';

const REASON = {
  line: 'Yan yana üç hücre tamamlandı.',
  full: 'Bütün hücreler doldu.',
  turns: 'Hamle hakları bitti.',
  time: 'Süre doldu.',
  forfeit: 'Rakip maçtan ayrıldı.',
};
const MODE_NAME = { klasik: 'Klasik', hizli: 'Hızlı', uzman: 'Uzman' };

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function GameScreen(ctx) {
  const { net, S } = ctx;
  let room = S.room;
  let g = room.game;
  const size = g.size;
  const race = g.style === 'race';
  const me = () => S.pid;

  let localSel = null; // benim seçtiğim hücre (sunucu onayından önce de geçerli)
  let lastTurnNo = null;
  let hint = null; // { cell, text }
  let cdTimer = null;
  let raf = 0;
  const anim = new Map();

  const player = (pid) => g.players.find((p) => p.pid === pid);
  // Açık başlık metni: "Manchester United × Claudio Ranieri ile çalıştı"
  const label = (cat) => (cat.head ? cat.head.filter(Boolean).join(' ') : cat.name);
  const cellName = (i) => `${label(g.rows[Math.floor(i / size)])} × ${label(g.cols[i % size])}`;
  const takeableFor = (i) => {
    const c = g.cells[i];
    return !c.owner || (g.steal && c.owner !== me() && !c.locked);
  };
  const penalty = () => (race ? Math.max(0, (player(me())?.cooldownUntil || 0) - net.now()) : 0);

  /* ── üst şerit, skor, sıra */
  const turnNo = h('span', { class: 'gturn' });
  const chip = [MODE_NAME[g.mode] || g.mode, race ? 'Aynı anda' : null, g.lineWin && g.players.length > 2 ? "3'leme" : null].filter(Boolean).join(' · ');
  const header = h('div', { class: 'gbar' },
    h('button', { class: 'icon-btn', title: 'Maçtan çık', 'aria-label': 'Maçtan çık', on: { click: confirmLeave } }, '✕'),
    h('span', { class: 'gcode' }, 'ODA ', h('b', {}, room.code)),
    h('span', { class: 'gmode' }, chip),
    turnNo);
  const board = h('div', { class: 'board' });
  const btxt = h('span', { class: 'btxt' });
  const secs = h('span', { class: 'secs' });
  const fill = h('div', { class: 'tfill' });
  const banner = h('div', { class: 'banner', role: 'status' }, btxt, secs, h('div', { class: 'tbar' }, fill));

  /* ── ızgara */
  const gridEl = h('div', { class: `grid n${size}` });
  gridEl.append(h('div', { class: 'corner' }, gridGlyph(size === 3 ? 34 : 28)));
  for (const c of g.cols) gridEl.append(catTile(c));
  const cells = [];
  for (let r = 0; r < size; r++) {
    gridEl.append(catTile(g.rows[r]));
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const el = h('button', { class: 'cell', on: { click: () => onCell(i) } });
      el.style.setProperty('--rot', `${(((i * 7) % 5) - 2) * 0.9}deg`);
      cells.push(el);
      gridEl.append(el);
    }
  }

  /* ── cevap paneli */
  const target = h('div', { class: 'target' });
  const hintBtn = h('button', { class: 'hint-btn', on: { click: askHint } }, '💡 İpucu al', h('small', {}, ' (1 hak)'));
  const hintBox = h('p', { class: 'hintbox', hidden: true });
  const input = h('input', {
    class: 'input', type: 'text', placeholder: 'Futbolcu adı yaz…', autocomplete: 'off', autocapitalize: 'words',
    spellcheck: 'false', enterkeyhint: 'search', 'aria-label': 'Futbolcu adı', role: 'combobox',
    'aria-autocomplete': 'list', 'aria-controls': 'fg-sugg', 'aria-expanded': 'false',
  });
  const list = h('ul', { class: 'sugg', id: 'fg-sugg', role: 'listbox' });
  const passBtn = h('button', { class: 'btn small', on: { click: doPass } }, 'PAS GEÇ');
  const panel = h('div', { class: 'answer card', hidden: true }, target, hintBtn, hintBox, input, list,
    h('div', { class: race ? 'row1' : 'row2' }, h('button', { class: 'btn ghost small', on: { click: cancelSel } }, 'VAZGEÇ'), race ? null : passBtn));
  const pickBar = h('div', { class: 'myturn', hidden: true },
    h('p', {}, race ? 'Bir hücreye dokun — ilk doğru bilen kapar.' : 'Bir hücreye dokun.'),
    race ? null : h('button', { class: 'btn small', on: { click: doPass } }, 'PAS GEÇ'));
  const feed = h('ul', { class: 'feed', 'aria-live': 'polite' });
  const results = h('div', { class: 'results', hidden: true });

  const el = h('section', { class: 'screen game' }, header, board, banner, gridEl, pickBar, panel, feed, results);

  /* ── arama */
  let items = [];
  let active = -1;
  let seq = 0;
  let submitting = false;

  const runSearch = debounce(async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) return renderSugg([]);
    try {
      const r = await net.request('search', { q });
      if (mine === seq) renderSugg(r.items);
    } catch {
      /* bağlantı yoksa liste boş kalır */
    }
  }, 110);

  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paintActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[active] || items[0];
      if (it) submit(it);
    } else if (e.key === 'Escape') {
      cancelSel();
    }
  });

  function renderSugg(arr) {
    items = arr;
    active = arr.length ? 0 : -1;
    input.setAttribute('aria-expanded', arr.length ? 'true' : 'false');
    if (!arr.length) {
      if (input.value.trim().length >= 2) list.replaceChildren(h('li', { class: 'none' }, 'Bu isimde futbolcu bulunamadı.'));
      else list.replaceChildren();
      return paintActive();
    }
    // Yıl yazılmaz; yalnız aynı adlı futbolcuları ayırt etmek için uyruk bayrağı
    list.replaceChildren(...arr.map((it, i) =>
      h('li', { role: 'option', id: `sg-${i}`, on: { mousedown: (e) => e.preventDefault(), click: () => submit(it) } },
        h('span', { class: 'nm' }, it.name),
        it.alias ? h('span', { class: 'al' }, it.alias) : null,
        it.flag ? h('span', { class: 'sugflag' }, flag(it.flag, 16)) : null)));
    paintActive();
  }

  function paintActive() {
    [...list.children].forEach((li, i) => li.classList.toggle('active', i === active));
    if (active >= 0) input.setAttribute('aria-activedescendant', `sg-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  /* ── eylemler */

  function resetSel() {
    localSel = null;
    panel._cell = undefined;
    input.value = '';
    renderSugg([]);
  }

  function canPlayNow() {
    if (g.over) return false;
    if (race) return !!player(me()) && !player(me()).left && penalty() <= 0;
    return g.turn?.pid === me();
  }

  function onCell(i) {
    if (g.over) return showCell(i);
    if (!canPlayNow()) {
      if (race && penalty() > 0) toast(`Yanlış cevap cezası: ${Math.ceil(penalty() / 1000)} sn`, 'error', 1400);
      return;
    }
    const c = g.cells[i];
    if (c.owner) {
      if (!g.steal) return toast('Bu hücre dolu.', 'error', 1600);
      if (c.owner === me()) return toast('Bu hücre zaten senin.', 'error', 1600);
      if (c.locked) return toast('Bu hücre kilitli, çalınamaz.', 'error', 1600);
    }
    if (localSel !== i) resetSel();
    localSel = i;
    update(room);
    input.focus(); // dokunuşun içinde: telefonda klavye açılsın
    if (!race) {
      net.request('game/select', { cell: i }).catch((e) => {
        toast(e.message, 'error');
        if (localSel === i) {
          localSel = null;
          update(room);
        }
      });
    }
  }

  async function submit(it) {
    const cell = localSel ?? (race ? null : g.turn?.selected);
    if (cell === null || cell === undefined || submitting) return;
    submitting = true;
    try {
      const r = await net.request('game/answer', { cell, fid: it.id });
      if (r.correct) toast(`✓ ${it.name}`, 'ok', 1800);
      else toast(`✗ ${it.name}: ${r.reasons.join(' · ')}${r.penalty ? ` · ${r.penalty} sn ceza` : ''}`, 'error', 4200);
      input.blur();
      if (race) {
        resetSel();
        if (!r.correct) {
          clearTimeout(cdTimer);
          cdTimer = setTimeout(() => update(room), (r.penalty || 3) * 1000 + 80);
        }
        update(room);
      }
    } catch (e) {
      toast(e.message, 'error');
      input.select();
    } finally {
      submitting = false;
    }
  }

  async function doPass() {
    try {
      await net.request('game/pass');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function askHint() {
    const cell = localSel ?? (race ? null : g.turn?.selected);
    if (cell === null || cell === undefined) return;
    try {
      const { hint: x } = await net.request('game/hint', { cell });
      const bits = [
        x.nats?.length ? x.nats.join(' / ') : 'uyruğu bilinmiyor',
        x.pos?.length ? x.pos.join(', ') : null,
        x.age ? `${x.age} yaşında` : null,
      ].filter(Boolean);
      hint = { cell, text: `💡 ${x.recent ? 'Yakın dönemden' : 'Olası'} bir cevap: ${bits.join(' · ')}` };
      update(room);
      input.focus();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function cancelSel() {
    resetSel();
    if (!race) net.request('game/select', { cell: null }).catch(() => {});
    input.blur();
    update(room);
  }

  function confirmLeave() {
    if (g.over) return ctx.leave();
    modal('MAÇTAN ÇIK?', h('p', {}, 'Maç sürerken çıkarsan hükmen kaybedersin.'), {
      actions: [
        (close) => h('button', { class: 'btn small', on: { click: close } }, 'VAZGEÇ'),
        (close) => h('button', { class: 'btn primary small', on: { click: () => { close(); ctx.leave({ forfeit: true }); } } }, 'ÇIK'),
      ],
    });
  }

  async function fetchCard(fid) {
    const r = await net.request('player/card', { fid });
    return r.card;
  }

  async function openCard(fid) {
    try {
      const card = await fetchCard(fid);
      modal(card.name, playerCard(card));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /** Maç sonunda hücreye dokununca: oynanan futbolcunun kartı + diğer olası cevaplar. */
  async function showCell(i) {
    const a = g.result?.answers?.[i];
    if (!a) return;
    const c = g.cells[i];
    const owner = c.owner ? player(c.owner) : null;
    const alts = h('div', { class: 'alts' },
      h('p', { class: 'label' }, c.name ? 'DİĞER OLASI CEVAPLAR' : 'OLASI CEVAPLAR'),
      a.alts.length
        ? h('div', { class: 'alt-links' }, a.alts.map((x) => h('button', { class: 'alt-link', on: { click: () => openCard(x.id) } }, x.name)))
        : h('p', {}, 'Başka cevap yoktu.'),
      h('p', { class: 'hint' }, `Veritabanında bu hücreye uyan ${a.total.toLocaleString('tr-TR')} futbolcu var. İsme dokun, kartını gör.`));
    const body = h('div', { class: 'cellinfo' }, c.name ? h('p', { class: 'hint' }, 'Oyuncu kartı yükleniyor…') : h('p', {}, 'Bu hücre boş kaldı.'), alts);
    modal(cellName(i), body);
    if (c.fid !== null && c.fid !== undefined) {
      try {
        const card = await fetchCard(c.fid);
        put(body, owner ? h('p', { class: 'pc-by', dataset: { color: owner.color } }, h('span', { class: 'dot' }), `${owner.nick} yazdı`) : null, playerCard(card), alts);
      } catch (e) {
        put(body, h('p', { class: 'err' }, e.message), alts);
      }
    }
  }

  /* ── akış ve animasyon */

  function feedText(e) {
    const where = Number.isInteger(e.cell) ? cellName(e.cell) : '';
    switch (e.kind) {
      case 'correct': return `✅ ${e.nick}: ${e.name} · ${where}`;
      case 'steal': return `🔁 ${e.nick} hücre çaldı: ${e.name} · ${where}`;
      case 'wrong': return `❌ ${e.nick}: ${e.name} — ${(e.reasons || []).join(', ')}`;
      case 'pass': return `⏭ ${e.nick} pas geçti`;
      case 'timeout': return `⏱ ${e.nick}: süre doldu`;
      case 'hint': return `💡 ${e.nick} ipucu kullandı`;
      case 'left': return `🚪 ${e.nick} maçtan ayrıldı`;
      default: return '';
    }
  }

  function renderFeed() {
    const last = g.log.slice(-3).reverse();
    const key = last.map((e) => e.id).join(',');
    if (feed._key === key) return;
    feed._key = key;
    feed.replaceChildren(...last.map((e) => h('li', { dataset: { color: e.color || '' } }, feedText(e))));
  }

  function onLog(e) {
    if (e.kind === 'correct' || e.kind === 'steal') anim.set(e.cell, 'fresh');
    else if (e.kind === 'wrong' && Number.isInteger(e.cell)) anim.set(e.cell, 'shake');
  }

  function flushAnim() {
    for (const [i, cls] of anim) {
      const c = cells[i];
      if (!c) continue;
      c.classList.remove('fresh', 'shake');
      void c.offsetWidth;
      c.classList.add(cls);
      setTimeout(() => c.classList.remove(cls), 650);
    }
    anim.clear();
  }

  /* ── sonuç */

  function renderResults() {
    const r = g.result;
    const my = me();
    const rec = ctx.recordFor(room);
    const key = `${room.round}|${room.status}|${room.hostPid}|${rec ? rec.delta : '-'}`;
    if (results._key === key) return;
    results._key = key;
    const isHost = room.hostPid === my;
    const won = r.winners.includes(my);
    const winner = r.winners.length === 1 ? r.standings.find((p) => p.pid === r.winners[0]) : null;
    const title = r.draw ? (r.winners.length ? 'Berabere' : 'Kazanan yok') : won ? 'Kazandın!' : `${winner?.nick ?? ''} kazandı`;
    const row = [];
    if (room.quick) row.push(h('button', { class: 'btn', on: { click: () => ctx.requeue(room.settings.capacity) } }, 'YENİ RAKİP BUL'));
    row.push(h('button', { class: 'btn', on: { click: () => ctx.leave() } }, 'ANA SAYFA'));
    put(results,
      h('div', { class: `rhead${won && !r.draw ? ' win' : ''}` }, h('h2', {}, title), h('p', {}, REASON[r.reason] || '')),
      h('ol', { class: 'standings' }, ...r.standings.map((p) =>
        h('li', { dataset: { color: p.color } },
          h('span', { class: 'rk' }, `${p.rank}.`),
          h('span', { class: 'dot' }),
          h('span', { class: 'nick' }, p.nick, p.pid === my ? ' (sen)' : '', p.bot ? ' 🤖' : ''),
          h('span', { class: 'st' }, `${p.cells} hücre · ${p.correct} doğru · ${p.wrong} yanlış${p.left ? ' · ayrıldı' : ''}`)))),
      rec
        ? h('p', { class: 'elo' }, 'ELO ', h('b', {}, String(rec.stats.elo)), ' ', h('span', { class: rec.delta >= 0 ? 'up' : 'down' }, `${rec.delta >= 0 ? '+' : ''}${rec.delta}`))
        : null,
      h('p', { class: 'hint center' }, 'Hücrelere dokun: oyuncu kartı ve diğer olası cevaplar.'),
      room.status === 'finished'
        ? isHost
          ? h('button', { class: 'btn primary big', on: { click: () => net.request('room/start').catch((e) => toast(e.message, 'error')) } }, 'RÖVANŞ')
          : h('p', { class: 'waiting' }, "Host'un rövanşı başlatması bekleniyor", h('span', { class: 'dots' }, '...'))
        : null,
      h('div', { class: row.length === 2 ? 'row2' : 'row1' }, row));
    results.hidden = false;
    if (!results._shown) {
      results._shown = true;
      setTimeout(() => results.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    }
  }

  /* ── güncelleme */

  function update(next) {
    room = next;
    g = next.game;
    if (!g) return;
    const my = me();
    const meP = player(my);
    const t = g.turn;
    const playing = !g.over && (race ? !!meP && !meP.left : !!t && t.pid === my);

    if (!race && (t?.no ?? null) !== lastTurnNo) {
      lastTurnNo = t?.no ?? null;
      resetSel();
      hint = null;
    }
    if (race && localSel !== null && !takeableFor(localSel)) {
      const c = g.cells[localSel];
      if (c.owner && c.owner !== my) toast(`${player(c.owner)?.nick} bu hücreyi kaptı!`, 'info', 1800);
      resetSel();
    }
    const sel = playing ? (localSel ?? (race ? null : t.selected)) : race ? null : (t?.selected ?? null);
    const cur = t ? player(t.pid) : null;
    const cd = penalty();

    turnNo.textContent = g.over ? 'MAÇ BİTTİ' : race ? '' : `HAMLE ${g.turnNo}/${g.maxTurns}`;

    board.replaceChildren(...g.order.map(player).filter(Boolean).map((p) =>
      h('div', {
        class: `pchip${!race && t?.pid === p.pid ? ' turn' : ''}${p.left ? ' left' : ''}${p.online ? '' : ' off'}${p.pid === my ? ' me' : ''}`,
        dataset: { color: p.color },
        title: p.left ? 'Maçtan ayrıldı' : p.online ? p.nick : 'Bağlantısı yok',
      },
        h('span', { class: 'dot' }),
        h('span', { class: 'nick' }, p.nick),
        p.pid === my && g.players.length <= 2 ? h('span', { class: 'you' }, 'SEN') : null,
        p.bot ? h('span', { class: 'bot', 'aria-label': 'bot' }, '🤖') : null,
        h('span', { class: 'cnt' }, String(p.cells)))));

    banner.dataset.color = race ? meP?.color || '' : cur?.color || '';
    banner.classList.toggle('mine', playing);
    if (g.over) btxt.textContent = 'Maç bitti.';
    else if (race) {
      btxt.textContent =
        cd > 0 ? `Yanlış cevap cezası · ${Math.ceil(cd / 1000)} sn bekle` : sel !== null ? `${cellName(sel)} — yaz, listeden seç` : 'Aynı anda! Bir hücre seç, ilk doğru bilen kapar.';
    } else if (playing) btxt.textContent = sel !== null ? `${cellName(sel)} — futbolcuyu yaz, listeden seç` : 'Sıra sende! Bir hücre seç.';
    else if (cur) btxt.replaceChildren(h('b', {}, cur.nick), !cur.online ? ' · bağlantısı yok, sıra birazdan geçecek' : sel !== null ? ` düşünüyor · ${cellName(sel)}` : ' hücre seçiyor…');

    g.cells.forEach((c, i) => {
      const cell = cells[i];
      const owner = c.owner ? player(c.owner) : null;
      const key = `${c.owner}|${c.name}|${c.locked}`;
      if (cell._key !== key) {
        cell._key = key;
        cell.dataset.color = owner?.color || '';
        cell.classList.toggle('owned', !!c.owner);
        put(cell,
          c.owner ? fit(h('span', { class: 'name' }, c.name), c.name) : h('span', { class: 'slot' }, String(i + 1)),
          c.locked ? h('span', { class: 'lock', 'aria-hidden': 'true' }, '🔒') : null);
        cell.setAttribute('aria-label', `${cellName(i)}${c.owner ? ` — ${c.name}, ${owner?.nick || ''}` : ''}`);
      }
      const takeable = playing && cd <= 0 && takeableFor(i);
      cell.classList.toggle('takeable', takeable);
      cell.classList.toggle('selected', sel === i && !g.over);
      cell.style.setProperty('--sel', COLOR_HEX[(race ? meP : cur)?.color] || '#14203a');
      cell.disabled = !(takeable || g.over || (race && playing));
      cell.classList.toggle('win', !!g.result?.winLine?.includes(i));
    });

    if (playing && sel !== null && cd <= 0) {
      if (panel._cell !== sel) {
        panel._cell = sel;
        target.replaceChildren(catChip(g.rows[Math.floor(sel / size)]), h('span', { class: 'x' }, '×'), catChip(g.cols[sel % size]));
      }
      const hintHere = hint && hint.cell === sel;
      hintBtn.hidden = !g.hints || !!meP?.hintUsed;
      hintBox.hidden = !hintHere;
      if (hintHere) hintBox.textContent = hint.text;
      panel.hidden = false;
      pickBar.hidden = true;
    } else {
      panel.hidden = true;
      pickBar.hidden = !playing || cd > 0;
    }

    renderFeed();
    if (g.over && g.result) renderResults();
    else results.hidden = true;
    flushAnim();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const endsAt = g.over ? null : race ? g.deadline : g.turn?.endsAt;
    if (!endsAt) {
      if (secs._v !== null) {
        secs._v = null;
        secs.textContent = '';
        fill.style.transform = 'scaleX(0)';
        banner.classList.remove('urgent');
      }
      return;
    }
    const left = Math.max(0, endsAt - net.now());
    fill.style.transform = `scaleX(${Math.min(1, left / (race ? g.matchMs : g.turnMs))})`;
    const label2 = race ? mmss(left) : `${Math.ceil(left / 1000)} sn`;
    if (secs._v !== label2) {
      secs._v = label2;
      secs.textContent = label2;
      banner.classList.toggle('urgent', left <= (race ? 15000 : 5000));
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    el,
    update,
    onLog,
    destroy: () => {
      cancelAnimationFrame(raf);
      clearTimeout(cdTimer);
    },
  };
}
