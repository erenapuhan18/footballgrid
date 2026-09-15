/* Oda kodları: 5 karakter (çakışma sürerse 6), Türkçe harf yok, karışan 0/O ve 1/I yok. */

import { randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(isTaken) {
  for (let len = 5; len <= 6; len++) {
    for (let i = 0; i < 60; i++) {
      let code = '';
      for (let j = 0; j < len; j++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!isTaken(code)) return code;
    }
  }
  throw new Error('oda kodu üretilemedi');
}

/** Kullanıcının yazdığını kanonik koda çevirir; geçersizse null.
    Büyük/küçük harf fark etmez; Türkçe klavyedeki ı/i/İ → I; boşluk ve tire yok sayılır. */
export function normalizeCode(raw) {
  const s = String(raw ?? '')
    .replace(/[\s\-_.]/g, '')
    .replace(/[ıİi]/g, 'I')
    .toUpperCase();
  return /^[A-Z0-9]{5,6}$/.test(s) ? s : null;
}
