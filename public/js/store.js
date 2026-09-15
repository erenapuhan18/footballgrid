/* Cihazda kalan her şey: geçici kimlik, son takma ad ve hesapsız istatistikler.
   Hiçbir kişisel bilgi yok. İleride hesap sistemine geçilirse `stats` bu arayüzü
   koruyan uzak bir depo ile değiştirilebilir (load/save/record). */

// Aynı tarayıcıda birden çok oyuncu denemek için: ?p=2 → ayrı anahtarlar
const slot = new URLSearchParams(location.search).get('p');
const SUFFIX = slot && /^\d{1,2}$/.test(slot) ? '.' + slot : '';
const K = {
  session: 'fg.session.v1' + SUFFIX,
  profile: 'fg.profile.v1' + SUFFIX,
  stats: 'fg.stats.v1' + SUFFIX,
};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? null;
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* gizli sekme / depolama kapalı: oturum yalnızca bu sayfa açıkken yaşar */
  }
}

const EMPTY = { matches: 0, wins: 0, losses: 0, draws: 0, correct: 0, wrong: 0, elo: 1000, recorded: [] };

export const store = {
  session: () => read(K.session),
  setSession: (s) => write(K.session, s),

  nick: () => read(K.profile)?.nick || '',
  setNick: (nick) => write(K.profile, { ...(read(K.profile) || {}), nick }),

  stats: () => ({ ...EMPTY, ...(read(K.stats) || {}) }),
  resetStats: () => write(K.stats, { ...EMPTY }),

  /** Maç sürerken çıkan oyuncu hükmen kaybeder. */
  forfeit(id) {
    const s = store.stats();
    if (s.recorded.includes(id)) return;
    s.matches += 1;
    s.losses += 1;
    s.elo = Math.max(100, s.elo - 12);
    s.recorded = [...s.recorded.slice(-40), id];
    write(K.stats, s);
  },

  /** Maç sonucunu bir kez işler. Döner: { outcome, delta, stats } ya da zaten işlendiyse null. */
  record(id, result, myPid, elos) {
    const s = store.stats();
    if (s.recorded.includes(id)) return null;
    const me = result.standings.find((x) => x.pid === myPid);
    if (!me) return null;
    const won = result.winners.includes(myPid);
    const outcome = won && !result.draw ? 'win' : won && result.draw ? 'draw' : 'loss';

    // Elo: her rakibe karşı sıralamaya göre 1 / 0.5 / 0; çok kişilide K bölünür.
    const opps = result.standings.filter((x) => x.pid !== myPid);
    const k = 32 / Math.max(1, opps.length);
    let delta = 0;
    for (const o of opps) {
      const oe = elos[o.pid] ?? 1000;
      const expected = 1 / (1 + 10 ** ((oe - s.elo) / 400));
      const score = me.rank < o.rank ? 1 : me.rank === o.rank ? 0.5 : 0;
      delta += k * (o.bot ? 0.5 : 1) * (score - expected);
    }
    delta = Math.round(delta);

    s.matches += 1;
    if (outcome === 'win') s.wins += 1;
    else if (outcome === 'draw') s.draws += 1;
    else s.losses += 1;
    s.correct += me.correct || 0;
    s.wrong += me.wrong || 0;
    s.elo = Math.max(100, s.elo + delta);
    s.recorded = [...s.recorded.slice(-40), id];
    write(K.stats, s);
    return { outcome, delta, stats: s };
  },
};
