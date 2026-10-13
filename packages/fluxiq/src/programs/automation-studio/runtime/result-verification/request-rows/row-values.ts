// Whether the values a judgement writes beside a row's name are that row's own
// (t489, D1).
//
// A judge names a row the way a person does: its title, often followed by its
// price and rating -- "<title>, $50.00, 4.6". Lane C round 13
// (`run-mv66s8yl-fbbfa221`, 0032) named a left-out row so, and its title's
// four-word start was also the start of a stored row with another price and
// rating. The left-out row was in no condition's witness list, so the prefix
// told the stored row apart from every row Core knew of, and Core called the
// judge's correct reading misread. A name is only part of a row's identity: a
// value written beside it that the row's cells contradict names another row.
//
// Two kinds of value are compared, each only where the row has cells of that
// kind: an amount written with a currency sign, and a number written with a
// decimal point. A whole number is never compared -- titles and counts carry
// them ("Lamp 2", "6 rows") -- and a value the row has no cell of that kind for
// says nothing either way. Nor is a bound: a value after "under", "at least" or
// the like is what the request asks of a row, not the row's own value.

/** A number as written: an optional currency sign, digits with optional thousands commas, an optional decimal part. */
const NUMBER = /([$€£¥])?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/gu;

/** Words before a value that make it a bound rather than a row's own value. */
const BOUND_BEFORE = /(?:\b(?:under|over|below|above|than|least|most|up to|within|from|between)|[<>≤≥])\s*$/iu;

type Value = { kind: "amount" | "decimal"; value: number };

/** Whether the values written in `text` beside a row's name agree with that row's `cells` (header): none contradicts a cell of its kind. */
export function automationStudioRequestRowValuesAgree(text: string, cells: readonly string[]): boolean {
  const own = cells.flatMap((cell) => valuesOf(cell));
  for (const written of valuesOf(text, true)) {
    const sameKind = own.filter((value) => value.kind === written.kind);
    if (sameKind.length && !sameKind.some((value) => value.value === written.value)) return false;
  }
  return true;
}

function valuesOf(text: string, ownOnly = false): Value[] {
  const values: Value[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const [, sign, whole, fraction] = match;
    if (ownOnly && BOUND_BEFORE.test(text.slice(0, match.index))) continue;
    const value = Number(`${whole!.replace(/,/gu, "")}${fraction !== undefined ? `.${fraction}` : ""}`);
    if (!Number.isFinite(value)) continue;
    if (sign !== undefined) values.push({ kind: "amount", value });
    else if (fraction !== undefined) values.push({ kind: "decimal", value });
  }
  return values;
}
