/* Bilinen kariyer gerçekleri — veri derlemesinden sonra hızlı akıl sağlığı kontrolü (5 büyük lig + Süper Lig).
   node tools/facts.mjs            → ✓/✗ listesi, çıkış kodu = başarısız sayısı */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold } from '../server/text.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(readFileSync(join(HERE, '..', 'server', 'data', 'db.json'), 'utf8'));
const ck = (k) => db.clubs.findIndex((c) => c.key === k);
const lk = (k) => db.leagues.findIndex((l) => l.key === k);
const nk = (name) => db.nations.findIndex((n) => fold(n.name) === fold(name));

function find(name, by) {
  const f = fold(name);
  const c = db.players.filter((p) => (fold(p[0]) === f || (p[7] || []).some((a) => fold(a) === f)) && (!by || p[1] === by));
  return c.sort((a, b) => b[2] - a[2])[0] || null;
}

// [ad, doğum yılı|null, { clubs, noClubs, lg, noLg, nats }]
const FACTS = [
  ['Kenny Dalglish', 1951, { clubs: ['liv', 'cel'], noLg: ['eng'] }],
  ['Kevin Keegan', 1951, { clubs: ['liv', 'hsv', 'sou', 'new'], lg: ['ger'], noLg: ['eng'] }],
  ['Marco van Basten', 1964, { clubs: ['aja', 'mil'], lg: ['ita', 'ned'], noLg: ['eng'] }],
  ['Diego Maradona', 1960, { clubs: ['bar', 'nap', 'sev', 'boca'], lg: ['esp', 'ita'], noLg: ['eng'], nats: ['Arjantin'] }],
  ['Gheorghe Hagi', 1965, { clubs: ['gs', 'rma', 'bar'], lg: ['tr1', 'esp'], noLg: ['eng'] }],
  ['Alan Shearer', 1970, { clubs: ['new', 'sou'], lg: ['eng'] }],
  ['Ruud Gullit', 1962, { clubs: ['mil', 'che', 'psv', 'fey', 'samp'], lg: ['eng', 'ita', 'ned'] }],
  ['Thierry Henry', 1977, { clubs: ['asm', 'juv', 'ars', 'bar'], lg: ['fra', 'ita', 'eng', 'esp', 'mls'], nats: ['Fransa'] }],
  ['Zlatan Ibrahimović', 1981, { clubs: ['aja', 'juv', 'int', 'bar', 'mil', 'psg', 'mun', 'lag'], lg: ['ned', 'ita', 'esp', 'fra', 'eng', 'mls'] }],
  ['Cristiano Ronaldo', 1985, { clubs: ['scp', 'mun', 'rma', 'juv', 'nas'], lg: ['por', 'eng', 'esp', 'ita', 'ksa'], nats: ['Portekiz'] }],
  ['Lionel Messi', 1987, { clubs: ['bar', 'psg', 'mia'], lg: ['esp', 'fra', 'mls'], nats: ['Arjantin'] }],
  ['Kylian Mbappé', 1998, { clubs: ['asm', 'psg', 'rma'], nats: ['Fransa'] }],
  ['Karim Benzema', 1987, { clubs: ['ol', 'rma', 'itt'], nats: ['Fransa'] }],
  ['Pepe', 1983, { clubs: ['fcp', 'rma', 'bjk'], nats: ['Portekiz'] }],
  ['Mesut Özil', 1988, { clubs: ['s04', 'svw', 'rma', 'ars', 'fb', 'ibfk'], lg: ['ger', 'esp', 'eng', 'tr1'], nats: ['Almanya'] }],
  ['Lukas Podolski', 1985, { clubs: ['bay', 'ars', 'int', 'gs', 'ant'], lg: ['ger', 'eng', 'ita', 'tr1'], nats: ['Almanya'] }],
  ['Hakan Şükür', 1971, { clubs: ['bursa', 'gs', 'int', 'tor', 'prm'], lg: ['tr1', 'ita', 'eng'], nats: ['Türkiye'] }],
  ['Hamit Altıntop', 1982, { clubs: ['s04', 'bay', 'rma', 'gs'], lg: ['ger', 'esp', 'tr1'], nats: ['Türkiye'] }],
  ['Hakan Çalhanoğlu', 1994, { clubs: ['hsv', 'b04', 'mil', 'int'], lg: ['ger', 'ita'], nats: ['Türkiye'] }],
  ['Emre Belözoğlu', 1980, { clubs: ['gs', 'int', 'new', 'atm', 'fb', 'ibfk'], lg: ['tr1', 'ita', 'eng', 'esp'] }],
  ['Nihat Kahveci', 1979, { clubs: ['bjk', 'rso', 'vil'], lg: ['tr1', 'esp'] }],
  ['Arda Turan', 1987, { clubs: ['gs', 'atm', 'bar', 'ibfk'], lg: ['tr1', 'esp'] }],
  ['Ricardo Quaresma', 1983, { clubs: ['scp', 'bar', 'fcp', 'int', 'che', 'bjk'], lg: ['por', 'esp', 'ita', 'eng', 'tr1'] }],
  ['Wesley Sneijder', 1984, { clubs: ['aja', 'rma', 'int', 'gs'], lg: ['ned', 'esp', 'ita', 'tr1'] }],
  ['Didier Drogba', 1978, { clubs: ['om', 'che', 'gs'], lg: ['fra', 'eng', 'tr1'] }],
  ['Burak Yılmaz', 1985, { clubs: ['ant', 'bjk', 'fb', 'ts', 'gs', 'losc'], lg: ['tr1', 'fra'], nats: ['Türkiye'] }],
  ['Dries Mertens', 1987, { clubs: ['psv', 'nap', 'gs'], lg: ['ned', 'ita', 'tr1'] }],
  ['Mauro Icardi', 1993, { clubs: ['samp', 'int', 'psg', 'gs'], nats: ['Arjantin'] }],
  ['Edin Džeko', 1986, { clubs: ['wob', 'mci', 'rom', 'int', 'fb'], lg: ['ger', 'eng', 'ita', 'tr1'] }],
  ['Romelu Lukaku', 1993, { clubs: ['rsca', 'che', 'eve', 'mun', 'int', 'rom', 'nap', 'fb'], lg: ['eng', 'ita', 'tr1'], nats: ['Belçika'] }],
  ['Arda Güler', 2005, { clubs: ['fb', 'rma'], noClubs: ['gs', 'bjk'], nats: ['Türkiye'] }],
  ['Victor Osimhen', 1998, { clubs: ['wob', 'losc', 'nap', 'gs'], lg: ['ger', 'fra', 'ita', 'tr1'] }],
  // jokerler
  ['Clarence Seedorf', 1976, { clubs: ['aja', 'rma', 'mil', 'int'], wild: ['ucl2', 'ucl3', 'ucl2clubs', 'uclfinal'] }],
  ['Paolo Maldini', 1968, { clubs: ['mil'], wild: ['oneclub', 'apps300', 'apps500', 'ucl2', 'uclfinal', 'nt100'] }],
  ['Francesco Totti', 1976, { clubs: ['rom'], wild: ['oneclub', 'apps300', 'apps500', 'goals100'] }],
  ['Iker Casillas', 1981, { clubs: ['rma', 'fcp'], wild: ['ucl2', 'ucl3', 'uclfinal', 'nt100'] }],
  ['Rüştü Reçber', 1973, { clubs: ['fb', 'bar', 'bjk'], wild: ['nt100'] }],
  ['Andrés Iniesta', 1984, { clubs: ['bar'], wild: ['treble', 'ucl2', 'uclfinal', 'nt100'] }],
];

let fail = 0;
let pass = 0;
for (const [name, by, f] of FACTS) {
  const p = find(name, by);
  if (!p) {
    console.log(`✗ ${name}: bulunamadı`);
    fail++;
    continue;
  }
  const errs = [];
  const wk = (k) => (db.wilds || []).findIndex((w) => w.key === k);
  for (const k of f.wild || []) if (wk(k) >= 0 && !(p[11] || []).includes(wk(k))) errs.push(`joker yok: ${k}`);
  for (const k of f.noWild || []) if (wk(k) >= 0 && (p[11] || []).includes(wk(k))) errs.push(`fazla joker: ${k}`);
  for (const k of f.clubs || []) if (ck(k) >= 0 && !p[3].includes(ck(k))) errs.push(`kulüp yok: ${k}`);
  for (const k of f.noClubs || []) if (ck(k) >= 0 && p[3].includes(ck(k))) errs.push(`fazla kulüp: ${k}`);
  for (const k of f.lg || []) if (!p[5].includes(lk(k))) errs.push(`lig yok: ${k}`);
  for (const k of f.noLg || []) if (p[5].includes(lk(k))) errs.push(`fazla lig: ${k}`);
  if (f.nats) {
    const want = f.nats.map(nk).filter((i) => i >= 0).sort((a, b) => a - b);
    const got = [...p[4]].sort((a, b) => a - b);
    if (want.join() !== got.join()) errs.push(`uyruk: ${got.map((i) => db.nations[i].name).join('/') || '—'} (beklenen ${f.nats.join('/')})`);
  }
  if (errs.length) {
    console.log(`✗ ${p[0]}: ${errs.join(' · ')}`);
    fail++;
  } else pass++;
}

// yazım farkıyla iki kez eklenmiş futbolcu kalmasın
const DUP = [['Salah', 1992], ['Mercan', 2000], ['Kudus', 2000], ['Elmas', 1999], ['Anguissa', 1995], ['Batagov', 2001], ['Sikan', 2001], ['Samudio', 1995]];
for (const [sur, by] of DUP) {
  const n = db.players.filter((p) => fold(p[0]).split(/[\s-]+/).at(-1) === fold(sur) && p[1] && Math.abs(p[1] - by) <= 1).length;
  if (n === 1) pass++;
  else {
    console.log(`✗ ${sur} (${by}): ${n} kayıt`);
    fail++;
  }
}
/* Kriter listeleri elle seçildi (kullanıcı istedi) — veri derlemesi bunları düşürmesin */
const eq = (label, got, want) => {
  if (got.join('|') === want.join('|')) return pass++;
  console.log(`✗ ${label}: ${got.join(', ') || '—'}\n   beklenen: ${want.join(', ')}`);
  fail++;
};
eq('hocalar', db.managers.map((m) => m.name), [
  'Pep Guardiola', 'José Mourinho', 'Carlo Ancelotti', 'Alex Ferguson', 'Arsène Wenger', 'Fatih Terim', 'Louis van Gaal',
  'Rafa Benítez', 'Jürgen Klopp', 'Roberto Mancini', 'Antonio Conte', 'Unai Emery', 'Brendan Rodgers',
]);
eq('kupalar', db.cups.map((c) => c.key), ['ballon', 'ucl', 'uel', 'uecl', 'ger', 'ita', 'esp', 'eng', 'tr1', 'copa', 'euro', 'wc']);

/* Kulüp başlıkları: 206 cevap eşiği + elle çıkarılanlar, Süper Lig'in dördü muaf (server/db.js) */
const CLUB_MIN = 206;
const CLUB_KEEP = ['gs', 'fb', 'bjk', 'ts'];
const CLUB_DROP = ['whu', 'fla', 'samp', 'rcde', 'tor', 'val', 'sep', 'spfc', 'sccp', 'lee', 'udi',
  'prm', 'vfb', 'boca', 'dep', 'hsv', 'asse', 'ogcn', 'fcgb', 'czv', 'svw', 'sou'];
const clubAnswers = (i) => db.players.filter((p) => p[2] >= 15 && p[3].includes(i)).length;
const heads = [];
for (const [i, c] of db.clubs.entries()) {
  const n = clubAnswers(i);
  const isHead = CLUB_KEEP.includes(c.key) || (!CLUB_DROP.includes(c.key) && n >= CLUB_MIN);
  if (isHead) heads.push(c.key);
  else if (CLUB_KEEP.includes(c.key)) {
    console.log(`✗ ${c.name} muaf olmasına rağmen başlık değil`);
    fail++;
  }
}
eq('kulüp başlığı sayısı', [String(heads.length)], ['53']);
for (const k of CLUB_KEEP) {
  if (heads.includes(k)) pass++;
  else {
    console.log(`✗ ${k} başlık listesinde yok (muaf olmalı)`);
    fail++;
  }
}
for (const k of CLUB_DROP) {
  if (!heads.includes(k)) pass++;
  else {
    console.log(`✗ ${k} çıkarılmış olmalıydı`);
    fail++;
  }
}
eq('özel şartlar', db.wilds.map((w) => w.key), [
  'uclfinal', 'uclfinalgoal', 'wcfinal', 'wcfinalgoal', 'uclwc', 'treble', 'big3', 'big4', 'ucl3',
  'lt3esp', 'lt3eng', 'lt3ita', 'lt3ger', 'lt3tr1',
]);

// Her başlıkta oyun kurabilecek kadar tanınmış cevap olmalı (ızgara üreticinin eşiği 8)
for (const [label, list, col] of [['kupa', db.cups, 9], ['hoca', db.managers, 10], ['özel', db.wilds, 11]]) {
  for (const [i, item] of list.entries()) {
    const n = db.players.filter((p) => p[2] >= 15 && (p[col] || []).includes(i)).length;
    if (n >= 8) pass++;
    else {
      console.log(`✗ ${label} "${item.name}": tanınmış cevap ${n} (en az 8 gerekli)`);
      fail++;
    }
  }
}

// Bilinen başarılar doğru başlıkta mı?
const has = (name, list, key, by = null) => {
  const p = find(name, by);
  // hocalar QID ile duruyor, listede ada göre aranır
  const i = list === 'managers' ? db.managers.findIndex((x) => x.name.includes(key)) : db[list].findIndex((x) => x.key === key);
  const col = { cups: 9, managers: 10, wilds: 11 }[list];
  if (p && i >= 0 && (p[col] || []).includes(i)) return pass++;
  console.log(`✗ ${name} → ${list}:${key} yok`);
  fail++;
};
const wonAll = (list, key, names) => names.forEach((n) => (Array.isArray(n) ? has(n[0], list, key, n[1]) : has(n, list, key)));

/* Bilinen kupa/hoca/şart eşleşmeleri — veri turlarında kaybolmasın.
   Milli takım kupaları turnuvanın "… squads" maddesinden geliyor (Wikidata'nın P1344 kaydı Copa América'da
   neredeyse boş: Roberto Carlos 1997/99 kazandı, kaydı yoktu). Hoca dönemleri kulüplerin P286'sı + hocanın
   kendi bilgi kutusu (Benítez'in Liverpool'u, Terim'in milli takımı Wikidata'da yok). */
wonAll('cups', 'copa', ['Roberto Carlos', ['Ronaldo', 1976], 'Rivaldo', 'Cafu', 'Ronaldinho', 'Dani Alves', 'Lionel Messi',
  'Ángel Di María', 'Luis Suárez', 'Diego Forlán', 'Arturo Vidal', 'Alexis Sánchez']);
wonAll('cups', 'wc', ['Gianluigi Buffon', 'Andrea Pirlo', 'Fabio Cannavaro', 'Iker Casillas', 'Andrés Iniesta', 'Xavi',
  'David Villa', 'Zinedine Zidane', 'Thierry Henry', 'Kylian Mbappé', 'Manuel Neuer', 'Thomas Müller', 'Philipp Lahm', 'Kaká']);
wonAll('cups', 'euro', ['Iker Casillas', 'Andrés Iniesta', 'Xavi', 'David Villa', 'Zinedine Zidane', 'Thierry Henry',
  'Cristiano Ronaldo', 'Pepe', 'Giorgio Chiellini', 'Leonardo Bonucci']);
wonAll('cups', 'ucl', ['Steven Gerrard', 'Andriy Şevçenko', "Samuel Eto'o", 'Wesley Sneijder', 'Didier Drogba', 'Gareth Bale', 'Luka Modrić']);
wonAll('cups', 'tr1', ['Rüştü Reçber', 'Gheorghe Hagi', 'Alex de Souza', 'Mario Gómez', 'Vincent Aboubakar']);
wonAll('cups', 'uel', ['Henrih Mhitaryan', 'Radamel Falcao', 'Antoine Griezmann']);
wonAll('cups', 'uecl', ['Declan Rice', 'Cole Palmer']);
wonAll('cups', 'ita', ['Francesco Totti', 'Paolo Maldini', 'Roberto Baggio']);
wonAll('cups', 'esp', ['Xabi Alonso', 'Raúl González']);
wonAll('cups', 'eng', ['Frank Lampard', 'Ryan Giggs', 'Sergio Agüero']);
wonAll('cups', 'ger', ['Franck Ribéry', 'Arjen Robben']);

for (const [name, mgr] of [['Lionel Messi', 'Guardiola'], ['Cristiano Ronaldo', 'Ferguson'], ['Mesut Özil', 'Mourinho'],
  ['Cesc Fàbregas', 'Wenger'], ['Hakan Şükür', 'Terim'], ['Rüştü Reçber', 'Terim'], ['Arda Turan', 'Terim'],
  ['Emre Belözoğlu', 'Terim'], ['Arda Güler', 'Ancelotti'], ['Mohamed Salah', 'Klopp'], ['Romelu Lukaku', 'Conte'],
  ['Wesley Sneijder', 'Mourinho'], ['Robin van Persie', 'Wenger'], ['Mario Balotelli', 'Mancini'],
  ['Xabi Alonso', 'Benítez'], ['Steven Gerrard', 'Benítez'], ['Fernando Torres', 'Benítez'],
  ['Raheem Sterling', 'Rodgers'], ['Luis Suárez', 'Rodgers']]) has(name, 'managers', mgr);

/* "X ile oynadı": aynı kulüp **ya da A milli takımı**, aynı dönemde (kullanıcı milli takımın da sayılmasını
   istedi). Alt yaş milli takımları ve kulüp B takımları sayılmaz; milli takım dönemi bitişi bilinmiyorsa
   kulüp kariyerinin sonuyla kapatılır (eskiden "2,5 yıl sürdü" sayılıp çakışmaları kaçırıyordu). */
const mate = (star, player, want) => {
  const i = db.mates.findIndex((m) => m.name === star);
  const p = find(player);
  const got = !!(p && i >= 0 && (p[13] || []).includes(i));
  if (got === want) return pass++;
  console.log(`✗ ${star} × ${player}: ${got ? 'kabul' : 'red'} (beklenen ${want ? 'kabul' : 'red'})`);
  fail++;
};
for (const [a, b] of [['Hakan Şükür', 'Rüştü Reçber'], ['Hakan Şükür', 'Alpay Özalan'], ['Gheorghe Hagi', 'Cristian Chivu'],
  ['Didier Drogba', 'Yaya Touré'], ['Ronaldinho', 'Roberto Carlos'], ['Arda Turan', 'Volkan Demirel'],
  ['Arda Güler', 'Hakan Çalhanoğlu'], ['Arda Güler', 'Kerem Aktürkoğlu'], ['Burak Yılmaz', 'Rüştü Reçber'],
  ['Mesut Özil', 'Manuel Neuer'], ['Cristiano Ronaldo', 'Pepe'], ['Lionel Messi', 'Ángel Di María'],
  ['Edin Džeko', 'Miralem Pjanić'], ['Victor Osimhen', 'Wilfred Ndidi']]) mate(a, b, true);
for (const [a, b] of [['Hakan Şükür', 'Lionel Messi'], ['Arda Turan', 'Manuel Neuer'], ['Ronaldinho', 'Wayne Rooney'],
  ['Arda Güler', 'Erling Haaland'], ['Hakan Şükür', 'Zinedine Zidane'], ['Lamine Yamal', 'Rüştü Reçber'],
  ['Arda Güler', 'Hakan Şükür']]) mate(a, b, false);

for (const [name, w] of [['Zinedine Zidane', 'uclfinalgoal'], ['Steven Gerrard', 'uclfinalgoal'],
  ['Andrés Iniesta', 'wcfinalgoal'], ['Mario Götze', 'wcfinalgoal'], ['Xavi', 'uclwc'], ['Arjen Robben', 'wcfinal'],
  ['Zlatan Ibrahimović', 'big3'], ['Ricardo Quaresma', 'big3'], ['Arjen Robben', 'treble'],
  ['Andrés Iniesta', 'lt3esp'], ['Ryan Giggs', 'lt3eng'], ['Hakan Şükür', 'lt3tr1'], ['Paolo Maldini', 'ucl3']]) has(name, 'wilds', w);
has('Lionel Messi', 'cups', 'ballon');
has('Lionel Messi', 'wilds', 'wcfinalgoal');
has('Lionel Messi', 'wilds', 'uclfinalgoal');
has('Zinedine Zidane', 'wilds', 'uclwc');
has('Andrés Iniesta', 'wilds', 'uclwc');
has('Henrih Mhitaryan', 'cups', 'uecl');
has('Dani Alves', 'cups', 'copa');
has('Gianluigi Buffon', 'wilds', 'wcfinal');
has('Arjen Robben', 'wilds', 'wcfinal');
has('Mesut Özil', 'managers', 'Mourinho');

console.log(`\n${pass} ✓ · ${fail} ✗`);
process.exitCode = Math.min(fail, 100);
