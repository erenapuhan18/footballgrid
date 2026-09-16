/* Veri denetimi: server/data/db.json ↔ İngilizce Wikipedia bilgi kutuları (A takım kariyeri, milli takım,
   doğum yılı) ve lig sezonu katılımcıları (lig üyeliği sezon sezon). Rapor: tools/audit.txt

   node --max-old-space-size=2000 tools/audit.mjs */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enTitles, infoboxes, titleQids, leagueSeasons, span } from './wiki.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(readFileSync(join(HERE, '..', 'server', 'data', 'db.json'), 'utf8'));
const R = JSON.parse(readFileSync(join(HERE, 'resolved.json'), 'utf8'));
const NOW = 2026.7;
const BIG = ['tr1', 'eng', 'esp', 'ita', 'ger', 'fra'];
const lines = [];
const out = (...a) => {
  const s = a.join(' ');
  console.log(s);
  lines.push(s);
};

const clubOfQ = new Map();
db.clubs.forEach((c, i) => {
  const r = R.clubs[c.key];
  [r.qid, ...(r.extra || [])].forEach((q) => clubOfQ.set(q, i));
});
const natOfNt = new Map();
db.nations.forEach((n, i) => R.nt[n.key] && natOfNt.set(R.nt[n.key].qid, i));

const withQ = db.players.filter((p) => p[8]);
out(`futbolcu: ${db.players.length} · QID'li: ${withQ.length}`);
const titleOf = await enTitles(withQ.map((p) => p[8]));
out(`enwiki maddesi olan: ${titleOf.size}`);
const IB = await infoboxes([...titleOf.values()], { log: console.log });
const links = new Set();
for (const ib of IB.values()) {
  if (!ib) continue;
  ib.c.forEach((x) => x[0] && links.add(x[0]));
  ib.y.forEach((t) => links.add(t));
  ib.n.forEach((x) => links.add(x[0]));
}
out(`bilgi kutusu bağlantısı: ${links.size} farklı başlık`);
const QOF = await titleQids([...links], { log: console.log });

// lig → kulüp QID → [sezon aralıkları]
const seasons = {};
for (const key of BIG) {
  const lg = db.leagues.find((l) => l.key === key);
  const ss = await leagueSeasons(lg.qid);
  const m = new Map();
  for (const s of ss) {
    if (!s.span) continue;
    for (const c of s.clubs) (m.get(c) || m.set(c, []).get(c)).push(s.span);
  }
  seasons[key] = m;
  const thin = ss.filter((s) => s.span && s.span[0] > 1990 && s.clubs.size < 12).map((s) => `${s.title}:${s.clubs.size}`);
  out(`${key}: ${ss.length} sezon · Wikipedia tablosundan ${ss.filter((s) => s.wp).length} · kulüp ${m.size}${thin.length ? ' · eksik: ' + thin.join(', ') : ''}`);
}

const st = { ib: 0, noTitle: 0, noIb: 0, noClubs: 0, scope: 0 };
const rep = { youth: [], odd: [], missing: [], lgDel: [], lgAdd: [], natExtra: [], natMissing: [], cur: [], by: [] };
for (const p of withQ) {
  const t = titleOf.get(p[8]);
  if (!t) {
    st.noTitle++;
    continue;
  }
  const ib = IB.get(t);
  if (!ib) {
    st.noIb++;
    continue;
  }
  if (ib.by && ib.by !== p[1]) rep.by.push([p[2], `${p[0]} (sl ${p[2]})`, `Wikidata ${p[1] ?? '—'} · Wikipedia ${ib.by}`]);
  if (!ib.c.length) {
    st.noClubs++;
    continue;
  }
  st.ib++;
  const ours = new Set(p[3]);
  const wpClubs = new Set();
  const wpYouth = new Set();
  const stints = [];
  let unmapped = 0;
  for (const [ct, , a, b] of ib.c) {
    const q = ct ? QOF.get(ct) : null;
    if (!q) {
      unmapped++;
      continue;
    }
    if (clubOfQ.has(q)) wpClubs.add(clubOfQ.get(q));
    const sp = span(a, b, NOW);
    if (sp) stints.push([q, ...sp]);
  }
  for (const yt of ib.y) {
    const q = QOF.get(yt);
    if (q && clubOfQ.has(q)) wpYouth.add(clubOfQ.get(q));
  }
  const inScope = [...ours, ...wpClubs].some((c) => BIG.includes(db.clubs[c].league));
  if (!inScope) continue;
  st.scope++;
  const name = `${p[0]} (${p[1] || '?'}, sl ${p[2]})`;
  const um = unmapped ? ` [eşlenemeyen ${unmapped}/${ib.c.length}]` : '';
  for (const c of ours) if (!wpClubs.has(c)) (wpYouth.has(c) ? rep.youth : rep.odd).push([p[2], name, db.clubs[c].name + um]);
  for (const c of wpClubs) if (!ours.has(c)) rep.missing.push([p[2], name, db.clubs[c].name]);

  const newL = new Set();
  for (const key of BIG) {
    const m = seasons[key];
    const cur = (a, b) => (b >= NOW - 0.01 ? NOW + 0.7 : b); // hâlâ oradaysa bu sezonun sonuna kadar
    if (stints.some(([q, a, b]) => (m.get(q) || []).some(([x, y]) => Math.min(cur(a, b), y) - Math.max(a, x) >= 0.25))) newL.add(key);
  }
  const oldL = new Set(p[5].map((i) => db.leagues[i].key).filter((k) => BIG.includes(k)));
  for (const k of oldL) if (!newL.has(k)) rep.lgDel.push([p[2], name, k + um]);
  for (const k of newL) if (!oldL.has(k)) rep.lgAdd.push([p[2], name, k]);

  const wpNat = new Set(ib.n.map(([nt]) => QOF.get(nt)).filter((q) => natOfNt.has(q)).map((q) => natOfNt.get(q)));
  if (wpNat.size) {
    const played = [...wpNat].map((i) => db.nations[i].name).join('/');
    for (const n of p[4]) if (!wpNat.has(n)) rep.natExtra.push([p[2], name, `${db.nations[n].name} (oynadığı: ${played})`]);
    for (const n of wpNat) if (!p[4].includes(n)) rep.natMissing.push([p[2], name, db.nations[n].name]);
  }

  const open = ib.c.filter((x) => x[3] === null && x[2] !== null && x[0]);
  const wq = open.length ? QOF.get(open[open.length - 1][0]) : null;
  const wc = wq && clubOfQ.has(wq) ? clubOfQ.get(wq) : null;
  const ourCur = (p[12] || []).filter((x) => x[2] === 0).map((x) => x[0]);
  if (wc !== null && !ourCur.includes(wc))
    rep.cur.push([p[2], name, `Wikipedia: ${db.clubs[wc].name} · bizde: ${ourCur.map((c) => db.clubs[c].name).join('/') || '—'}`]);
}

out(`\nbilgi kutusu okunan: ${st.ib} · enwiki yok: ${st.noTitle} · kutu yok: ${st.noIb} · kulüpsüz kutu: ${st.noClubs} · kapsamda (5 büyük lig + Süper Lig kulübü): ${st.scope}`);
const show = (label, arr, n = 40) => {
  arr.sort((a, b) => b[0] - a[0]);
  out(`\n## ${label}: ${arr.length}  (sitelink ≥15: ${arr.filter((x) => x[0] >= 15).length})`);
  for (const x of arr.slice(0, n)) out('  ' + x.slice(1).join(' · '));
};
show('Bizde var, Wikipedia A takımında YOK — yalnız altyapısında', rep.youth);
show('Bizde var, Wikipedia A takımında YOK — altyapıda da yok', rep.odd);
show('Wikipedia A takımında var, bizde YOK', rep.missing);
show('Lig: bizde var, sezon sezon hesapta YOK', rep.lgDel);
show('Lig: sezon sezon hesapta var, bizde YOK', rep.lgAdd);
show('Uyruk: bizde fazladan (başka milli takımda oynamış)', rep.natExtra);
show('Uyruk: oynadığı milli takım bizde yok', rep.natMissing);
show('Güncel kulüp farkı', rep.cur);
show('Doğum yılı farkı', rep.by, 25);
const byLg = (arr) => BIG.map((k) => `${k}:${arr.filter((x) => x[2].startsWith(k) && x[0] >= 15).length}`).join(' ');
out(`\nlig farkı (sl≥15) — silinecek: ${byLg(rep.lgDel)} · eklenecek: ${byLg(rep.lgAdd)}`);
writeFileSync(join(HERE, 'audit.txt'), lines.join('\n'));
console.log('\n→ tools/audit.txt');
