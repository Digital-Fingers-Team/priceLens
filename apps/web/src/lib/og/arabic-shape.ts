/**
 * Arabic for satori (the share card's renderer). Satori measures a word
 * before shaping it, so joined Arabic words got boxes of the wrong width and
 * ran into each other, and it does not reorder words in a right-to-left
 * line. Here the letters are shaped into Unicode presentation forms and each
 * line is put into visual (left-to-right) order, so satori only has to draw
 * plain glyphs in the order given.
 */

// Letter -> [isolated, final, initial, medial]; a right-joining letter has no initial/medial.
const FORMS: Record<number, number[]> = {};
const DUAL: Array<[number, number]> = [
  [0x0626, 0xfe89], [0x0628, 0xfe8f], [0x062a, 0xfe95], [0x062b, 0xfe99], [0x062c, 0xfe9d],
  [0x062d, 0xfea1], [0x062e, 0xfea5], [0x0633, 0xfeb1], [0x0634, 0xfeb5], [0x0635, 0xfeb9],
  [0x0636, 0xfebd], [0x0637, 0xfec1], [0x0638, 0xfec5], [0x0639, 0xfec9], [0x063a, 0xfecd],
  [0x0641, 0xfed1], [0x0642, 0xfed5], [0x0643, 0xfed9], [0x0644, 0xfedd], [0x0645, 0xfee1],
  [0x0646, 0xfee5], [0x0647, 0xfee9], [0x064a, 0xfef1],
];
const RIGHT: Array<[number, number]> = [
  [0x0622, 0xfe81], [0x0623, 0xfe83], [0x0624, 0xfe85], [0x0625, 0xfe87], [0x0627, 0xfe8d],
  [0x0629, 0xfe93], [0x062f, 0xfea9], [0x0630, 0xfeab], [0x0631, 0xfead], [0x0632, 0xfeaf],
  [0x0648, 0xfeed], [0x0649, 0xfeef],
];
for (const [c, f] of DUAL) FORMS[c] = [f, f + 1, f + 2, f + 3];
for (const [c, f] of RIGHT) FORMS[c] = [f, f + 1];
FORMS[0x0621] = [0xfe80];
// Lam followed by an alef is one ligature: [isolated, final].
const LAM_ALEF: Record<number, number[]> = {
  0x0622: [0xfef5, 0xfef6], 0x0623: [0xfef7, 0xfef8], 0x0625: [0xfef9, 0xfefa], 0x0627: [0xfefb, 0xfefc],
};
const TATWEEL = 0x0640;
/** Harakat and other marks: dropped (store titles seldom carry them). */
const MARK = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;

const joinsBefore = (c: number | undefined) => c === TATWEEL || (c != null && (FORMS[c]?.length ?? 0) === 4);
const joinsAfter = (c: number | undefined) => c === TATWEEL || (c != null && (FORMS[c]?.length ?? 0) >= 2);

/** One word's letters in presentation forms, still in logical order. */
export function shapeArabic(word: string): string {
  const cs = [...word.replace(MARK, '')].map((ch) => ch.codePointAt(0)!);
  const out: number[] = [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const forms = FORMS[c];
    const prevJoins = joinsBefore(cs[i - 1]);
    if (c === 0x0644 && LAM_ALEF[cs[i + 1]]) {
      out.push(LAM_ALEF[cs[i + 1]][prevJoins ? 1 : 0]);
      i++;
      continue;
    }
    if (!forms) {
      out.push(c);
      continue;
    }
    const nextJoins = forms.length === 4 && joinsAfter(cs[i + 1]);
    const form = prevJoins ? (nextJoins ? 3 : 1) : nextJoins ? 2 : 0;
    out.push(forms[form] ?? forms[prevJoins ? 1 : 0] ?? forms[0]);
  }
  return String.fromCodePoint(...out);
}

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
const BIDI_MARKS = /[‎‏؜]/g;
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

/**
 * A right-to-left line as the units a row-reverse flex box lays out from the
 * right (so it also wraps from the right): each Arabic word shaped and put in
 * visual order, a run of Latin words ("Galaxy A57") kept as one unit.
 */
export function rtlUnits(text: string): string[] {
  const words = text.replace(BIDI_MARKS, '').split(/\s+/).filter(Boolean);
  const kind = words.map((w) => (ARABIC.test(w) ? 'r' : LATIN_OR_DIGIT.test(w) ? 'l' : 'n'));
  // Punctuation between two Latin words belongs to their run ("A57 - 5G").
  kind.forEach((k, i) => {
    if (k === 'n' && kind[i - 1] === 'l' && kind[i + 1] === 'l') kind[i] = 'l';
  });
  const units: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) units.push(run.join(' '));
    run = [];
  };
  words.forEach((w, i) => {
    if (kind[i] === 'l') return void run.push(w);
    flush();
    units.push(kind[i] === 'r' ? visualWord(w) : w);
  });
  flush();
  return units;
}

/** An Arabic word shaped and reversed, brackets mirrored. */
function visualWord(word: string): string {
  return [...shapeArabic(word)]
    .reverse()
    .map((ch) => MIRROR[ch] ?? ch)
    .join('');
}
