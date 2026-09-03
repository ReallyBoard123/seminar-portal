/**
 * Matching what a participant types against the roster.
 *
 * Its own module because both the data layer and the sign-in layer need it,
 * and putting it in either one would make them import each other.
 */

/** ä→ae and friends before the accents are stripped, so a German speaker
 *  typing "mueller" and a keyboard-less one typing "muller" both land on
 *  "Müller". Applied first, because stripping diacritics would otherwise turn
 *  ü into a bare u and lose the ue spelling entirely. */
const TRANSLITERATIONS: [RegExp, string][] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

function strip(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function transliterate(value: string): string {
  return TRANSLITERATIONS.reduce((s, [re, to]) => s.replace(re, to), value);
}

/** Every spelling accepted for one participant: their last name and their
 *  full name, each with and without German transliteration. */
export function nameKeys(fullName: string): string[] {
  const lower = fullName.toLowerCase();
  const variants = [lower, transliterate(lower)];
  const keys = variants.flatMap((v) => {
    const parts = v.split(/\s+/).filter(Boolean);
    return [parts[parts.length - 1] ?? "", v];
  });
  return [...new Set(keys.map(strip).filter(Boolean))];
}

/** What the person typed, normalised the same way. Compared for equality
 *  only — never as a prefix, because this roster contains both Grau and
 *  Grauer and a prefix match would sign one in as the other. */
export function normaliseNameInput(input: string): string {
  return strip(transliterate(input.trim().toLowerCase()));
}
