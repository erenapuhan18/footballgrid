/* Türkçe duyarlı metin yardımcıları: arama/karşılaştırma için katlama ve -de/-da eki. */

const EXTRA = { ø: 'o', æ: 'ae', ß: 'ss', đ: 'd', ł: 'l', œ: 'oe', þ: 'th', ð: 'd', ı: 'i' };

/** "Şahin", "SAHIN", "şahin" → "sahin". İ/ı dahil bütün aksanları düşürür. */
export function fold(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øæßđłœþðı]/g, (c) => EXTRA[c]);
}

/** Karşılaştırma anahtarı: yalnızca harf ve rakam. "Eren_", "eren" ve "EREN" aynı sayılır. */
export function nickKey(s) {
  return fold(s).replace(/[^\p{L}\p{N}]/gu, '');
}

const BACK_VOWELS = 'aıouâáàãóòõôúùû';
const ALL_VOWELS = BACK_VOWELS + 'eiöüêéèëîíìïäåœæ';
const VOICELESS = 'fstkçşhpx';
// sıfır bir iki üç dört beş altı yedi sekiz dokuz
const DIGIT = ['da', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'];
// Kısaltmalar harf adıyla okunur: PSG → "pe-se-ge" → PSG'de; X → "iks" → 'te'
const LETTER = { A: 'da', I: 'da', K: 'da', O: 'da', U: 'da', X: 'te' };

/** Bulunma eki: "Real Madrid" → "Real Madrid'de", "Beşiktaş" → "Beşiktaş'ta", "PSG" → "PSG'de". */
export function locative(name) {
  const w = String(name).trim();
  const last = w.split(/\s+/).pop();
  if (/^\d+$/.test(last)) return `${w}'${DIGIT[Number(last.slice(-1))]}`;
  if (/^[A-ZÇĞİÖŞÜ]{2,}$/.test(last)) return `${w}'${LETTER[last.slice(-1)] ?? 'de'}`;
  const lower = [...last.toLocaleLowerCase('tr')];
  const vowel = [...lower].reverse().find((c) => ALL_VOWELS.includes(c)) ?? 'e';
  const v = BACK_VOWELS.includes(vowel) ? 'a' : 'e';
  const c = VOICELESS.includes(lower.at(-1)) ? 't' : 'd';
  return `${w}'${c}${v}`;
}
