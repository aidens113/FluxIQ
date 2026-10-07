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

/** Someone named, with no digit before them, then "and N other(s)": a count of N + 1. */
const NAMED_AND_OTHERS = /^[^\d]*\p{L}[^\d]*?\s+and\s+(\d[\d,]*)\s+others?\b/iu;

/** The first number written in a value: an optional sign, digits with group separators, and an optional fraction. */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/u;

/** The first number written in a value with every separator between its digits. */
const SEPARATED_NUMBER = /-?\d+(?:[.,]\d+)*/u;

/** The separator forms only a continental value writes, matched against the whole of `SEPARATED_NUMBER`'s match. */
const CONTINENTAL_NUMBER = /^-?(?:\d{1,3}(?:\.\d{3})+,\d+|\d+,\d{1,2}|\d{1,3}(?:\.\d{3}){2,})$/u;

/** The number a value states, or `undefined` for a value that states none. */
export function readAutomationStudioRecordNumber(value: string): number | undefined {
  const named = NAMED_AND_OTHERS.exec(value);
  if (named !== null) {
    const others = Number(named[1]!.replaceAll(",", ""));
    if (Number.isFinite(others)) return others + 1;
  }
  const separated = SEPARATED_NUMBER.exec(value);
  if (separated !== null && CONTINENTAL_NUMBER.test(separated[0])) {
    const number = Number(separated[0].replaceAll(".", "").replace(",", "."));
    if (Number.isFinite(number)) return number;
  }
  const found = NUMBER.exec(value);
  if (found === null) return undefined;
  const number = Number(found[0].replaceAll(",", ""));
  return Number.isFinite(number) ? number : undefined;
}
