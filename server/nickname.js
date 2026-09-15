/* Takma ad kuralları: 3-16 karakter, Türkçe harfler serbest, küfür/spam süzgeci,
   aynı odada aynı ad yok (büyük/küçük harf ve Türkçe karakter farkı sayılmaz). */

import { fold, nickKey } from './text.js';

export const NICK_MIN = 3;
export const NICK_MAX = 16;

const ALLOWED = /^[\p{L}\p{N} _.\-]+$/u;
const LINKY = /(https?|www\.|\.com\b|\.net\b|\.org\b|\.tr\b|\.io\b|discord|t\.me|instagram|tiktok)/i;
const RESERVED = new Set(['host', 'admin', 'yonetici', 'sistem', 'system', 'moderator', 'mod', 'footballgrid', 'bot', 'sunucu', 'server']);

// Kontrol ve görünmez biçim karakterleri. Aralık çalışma anında kurulur: U+2028 kaynakta
// düzenli ifade içine yazılırsa satır sonu sayılıp ifadeyi böler.
const INVISIBLE = new RegExp(
  '[' +
    [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]]
      .map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`)
      .join('') +
    ']',
  'g',
);

// Harf/rakam dışı her şey silinmiş metinde aranan, yanlış pozitifi düşük uzun kökler.
// (3 harfli kökler — "sik" gibi — "Işık" adını yakalayacağı için burada YOK; aşağıda kelime bazlı.)
const ROOTS = [
  'orospu', 'orspu', 'oruspu', 'siktir', 'sikerim', 'sikeyim', 'sikiyim', 'sikim', 'sikik', 'sikis',
  'amcik', 'amck', 'aminakoy', 'aminako', 'yarrak', 'dalyarak', 'pezevenk', 'pezeveng',
  'kahpe', 'gavat', 'serefsiz', 'yavsak', 'surtuk', 'fahise', 'kaltak', 'ibne', 'tasak', 'tassak',
  'gotveren', 'gotlek', 'anani', 'ananin', 'anasini', 'bacini', 'avradini', 'kerhane', 'godos',
  'fuck', 'fck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'whore', 'slut', 'pussy', 'asshole',
  'dickhead', 'porn', 'hitler', 'nazi', 'rape',
];
// Yalnızca tek başına kelime olarak yasak olanlar.
const WORDS = new Set(['sik', 'sikis', 'amk', 'aq', 'mk', 'oc', 'pic', 'got', 'pust', 'dick', 'fag', 'cock', 'sex', 'anal', 'tits', 'ass', 'yarak']);

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };

function filterForm(s) {
  return fold(s)
    .replace(/[0134578@$!|]/g, (c) => LEET[c])
    .replace(/(.)\1{2,}/g, '$1'); // "siiiiktir" → "siktir"; çift harfe dokunma ("Sikkim" ≠ "sikim")
}

export function isProfane(raw) {
  const t = filterForm(raw);
  const glued = t.replace(/[^a-z]/g, '');
  if (ROOTS.some((r) => glued.includes(r))) return true;
  return t.split(/[^a-z]+/).some((w) => WORDS.has(w));
}

export function cleanNick(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** { ok:true, nick } ya da { ok:false, error } */
export function validateNick(raw) {
  const nick = cleanNick(raw);
  const len = [...nick].length;
  if (len < NICK_MIN) return { ok: false, error: `Takma ad en az ${NICK_MIN} karakter olmalı.` };
  if (len > NICK_MAX) return { ok: false, error: `Takma ad en fazla ${NICK_MAX} karakter olabilir.` };
  if (!ALLOWED.test(nick)) return { ok: false, error: 'Takma adda yalnızca harf, rakam, boşluk ve _ . - kullanılabilir.' };
  if ((nick.match(/\p{L}/gu) || []).length < 2) return { ok: false, error: 'Takma ad en az 2 harf içermeli.' };
  if (/(.)\1{3,}/u.test(fold(nick))) return { ok: false, error: 'Aynı karakteri art arda bu kadar tekrarlama.' };
  const key = nickKey(nick);
  if (key.length >= 6 && new Set(key).size <= 2) return { ok: false, error: 'Bu takma ad spam gibi görünüyor.' };
  if (LINKY.test(nick)) return { ok: false, error: 'Takma adda bağlantı olamaz.' };
  if (RESERVED.has(key)) return { ok: false, error: 'Bu takma ad ayrılmış, başka bir tane dene.' };
  if (isProfane(nick)) return { ok: false, error: 'Bu takma ad uygun değil, başka bir tane dene.' };
  return { ok: true, nick };
}

export function sameNick(a, b) {
  return nickKey(a) === nickKey(b);
}

/** "Eren" alınmışsa → "Eren123", o da alınmışsa "Eren2", "Eren3"… */
export function suggestNick(nick, takenNicks) {
  const taken = (n) => takenNicks.some((t) => sameNick(t, n));
  const tries = ['123', ...Array.from({ length: 8 }, (_, i) => String(i + 2)), '_', '10', '99', '07'];
  for (const suffix of tries) {
    const base = [...nick].slice(0, NICK_MAX - suffix.length).join('');
    const cand = base + suffix;
    if (!taken(cand) && validateNick(cand).ok) return cand;
  }
  for (;;) {
    const n = String(100 + Math.floor(Math.random() * 900));
    const cand = [...nick].slice(0, NICK_MAX - 3).join('') + n;
    if (!taken(cand)) return cand;
  }
}
