/**
 * A name a page's tooling generated rather than a person wrote: a short
 * lower-case prefix, a hyphen or underscore, and a tail that mixes letters and
 * digits (`css-0732x7m`), is all digits (`jsx-1234`) or has a camel hump
 * (`sc-AxjAm`); or a leading underscore and a tail with a digit (`_a1b2c3`).
 * A name a site really shows with a digit in it ("Clip 21.4K2", "Visa 4417")
 * has no such prefix, and an ordinary hyphenated word (`e-mail`, `Wi-Fi`) no
 * such tail.
 */
const PREFIXED = /(?<![\w-])([a-z]{1,8})[-_]([A-Za-z0-9]{3,})(?![\w-])/gu;
const UNDERSCORED = /(?<![\w-])_([a-z0-9]{4,})(?![\w-])/giu;

function generatedTail(tail: string): boolean {
  if (/^\d{3,}$/u.test(tail)) return true;
  if (/\d/u.test(tail) && /[a-z]/iu.test(tail) && tail.length >= 4) return true;
  return /[a-z][A-Z]/u.test(tail);
}

/** Each generated name `text` shows, once, as a plain reason naming it. */
export function generatedNameFaults(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PREFIXED)) if (generatedTail(match[2]!)) found.add(match[0]);
  for (const match of text.matchAll(UNDERSCORED)) if (/\d/u.test(match[1]!)) found.add(match[0]);
  return [...found].map((token) => `generated name "${token}"`);
}
