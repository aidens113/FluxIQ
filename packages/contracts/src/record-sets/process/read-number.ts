// The number a text value states (P7). It is the downstream web domain's
// reading of a `where` bound, kept equal to it by the shared parity table
// `AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES`.
//
// The first number written is the value's number, group separators removed:
// "$1,299.00" is 1299, "3.7 out of 5 stars" is 3.7, "£65,000 to £80,000" is
// 65000. A first number whose separators can only be continental is read as
// written: a comma followed by one or two digits and nothing more ("169,00"),
// dot groups of three before a decimal comma ("1.165,00"), and two or more dot
// groups of three with no comma ("1.165.000"). A lone group of three, "1,165"
// or "1.165", keeps the comma-thousands, dot-decimal reading. A value naming
// someone before any digit and then "and N other(s)" states N + 1.
//
// A magnitude written on that number is part of it (t510): k or K directly
// after the digits, and before anything but a letter or digit, is thousand
// ("£72k" is 72000), and "4 thousand" and "1.5 million" are read as written. A
// bare m is minutes, metres or million, so m or M is million only on a number
// with a currency symbol written on it ("£3m", "€2M") or a decimal separator
// ("1.5m", "$1.2m"; supervisor, t510): "3m ago" and "10m" stay 3 and 10. A
// letter after a space ("5 m", "10 M") or a longer unit ("72kg", "5 km") is
// never a magnitude. Until t510 "£72k – £80k per annum" read as 72, so a bound
// of 70000 dropped it.

/** Someone named, with no digit before them, then "and N other(s)": a count of N + 1. */
const NAMED_AND_OTHERS = /^[^\d]*\p{L}[^\d]*?\s+and\s+(\d[\d,]*)\s+others?\b/iu;

/** The first number written in a value: an optional sign, digits with group separators, and an optional fraction. */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/u;

/** The first number written in a value with every separator between its digits. */
const SEPARATED_NUMBER = /-?\d+(?:[.,]\d+)*/u;

/** The separator forms only a continental value writes, matched against the whole of `SEPARATED_NUMBER`'s match. */
const CONTINENTAL_NUMBER = /^-?(?:\d{1,3}(?:\.\d{3})+,\d+|\d+,\d{1,2}|\d{1,3}(?:\.\d{3}){2,})$/u;

/** A currency symbol written directly before a number. */
const CURRENCY_BEFORE = /\p{Sc}$/u;

/** A magnitude written right after a number: a k or m on its digits, or the word after a space. */
const MAGNITUDE = /^(?:([km])(?![\p{L}\p{N}])|\s*(thousand|million)\b)/iu;
const MAGNITUDE_EXPONENT: Readonly<Record<string, number>> = { k: 3, thousand: 3, m: 6, million: 6 };

/** The number a value states, or `undefined` for a value that states none. */
export function readAutomationStudioRecordNumber(value: string): number | undefined {
  const named = NAMED_AND_OTHERS.exec(value);
  if (named !== null) {
    const others = Number(named[1]!.replaceAll(",", ""));
    if (Number.isFinite(others)) return others + 1;
  }
  const separated = SEPARATED_NUMBER.exec(value);
  if (separated !== null && CONTINENTAL_NUMBER.test(separated[0])) {
    const number = scaled(separated[0].replaceAll(".", "").replace(",", "."), value, separated.index, separated[0].length);
    if (Number.isFinite(number)) return number;
  }
  const found = NUMBER.exec(value);
  if (found === null) return undefined;
  const number = scaled(found[0].replaceAll(",", ""), value, found.index, found[0].length);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * The number `digits` writes (read from `value` at `index`, `length` long),
 * times the magnitude written after it, scaled in decimal so 1.2m is exactly
 * 1200000. A bare m counts only beside a currency symbol or a decimal separator.
 */
function scaled(digits: string, value: string, index: number, length: number): number {
  const magnitude = MAGNITUDE.exec(value.slice(index + length));
  const word = magnitude === null ? undefined : (magnitude[1] ?? magnitude[2]!).toLowerCase();
  const bareMillion = word === "m" && !digits.includes(".") && !CURRENCY_BEFORE.test(value.slice(0, index));
  const exponent = word === undefined || bareMillion ? 0 : MAGNITUDE_EXPONENT[word]!;
  return Number(exponent === 0 ? digits : `${digits}e${exponent}`);
}
