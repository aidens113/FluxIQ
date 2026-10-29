// The column of a read's sample rows that separates the rows a list of values keeps from the rest
// (t790 for the trial's feedback, t800 for the note beside an accepted submission).
//
// One rule for both: among the columns other than the one the values were listed against, the first
// whose cell is present on every listed row and on none of the others, absent on every listed row and
// present on all the others, or starts with a part every listed row shares and no other row does. A
// screened cell says nothing either way, so a column holding one is not weighed. Pure over rows given.
import type { JsonObject } from "../../../../../core/index.ts";

/** One sample row: column id to its text. */
type Row = Readonly<Record<string, string>>;

/** What a screened or empty cell reads as in a summary row: never a value to compare. */
const NOT_A_VALUE: ReadonlySet<string> = new Set(["[withheld]", "(withheld)", "(no value)"]);
/** The shortest shared start worth testing; a shorter one is a letter or two any row may start with. */
const SHORTEST_START = 4;
/** A column id a sentence may name. */
const COLUMN = /^[A-Za-z0-9_.$@-]{1,64}$/u;

/** The column (not `listedBy`) that marks `listed` among `rows`, with how, and the condition that tests it; `undefined` where none does. */
export function automationStudioSeparatingColumn(rows: readonly Row[], listedBy: string, listed: readonly Row[], others: readonly Row[]): { column: string; said: string; condition: JsonObject } | undefined {
  for (const column of new Set(rows.flatMap((row) => Object.keys(row)))) {
    if (column === listedBy || !COLUMN.test(column)) continue;
    const cell = (row: Row): string | null | undefined => {
      const value = (row[column] ?? "").trim();
      if (value === "(no value)") return "";
      return NOT_A_VALUE.has(value) ? null : value;
    };
    // A screened cell says nothing either way, so a column holding one is not weighed.
    if ([...listed, ...others].some((row) => cell(row) === null)) continue;
    const has = (row: Row) => cell(row) !== "";
    if (listed.every(has) && !others.some(has)) return { column, said: "has a value", condition: { field: column, is: "present" } };
    if (!listed.some(has) && others.every(has)) return { column, said: "has no value", condition: { field: column, is: "absent" } };
    if (listed.length < 2 || !listed.every(has)) continue;
    const start = sharedStart(listed.map((row) => cell(row)!));
    if (start.length >= SHORTEST_START && !others.some((row) => folded(cell(row)!).startsWith(folded(start)))) {
      return { column, said: `starts with ${JSON.stringify(start)}`, condition: { field: column, startsWith: start } };
    }
  }
  return undefined;
}

/** The longest start every value shares, case aside, cut back to a whole word where it ends inside one. */
function sharedStart(values: readonly string[]): string {
  const first = values[0]!;
  let length = first.length;
  for (const value of values.slice(1)) {
    let at = 0;
    while (at < length && at < value.length && first[at]!.toLowerCase() === value[at]!.toLowerCase()) at += 1;
    length = at;
  }
  const start = first.slice(0, length);
  if (values.every((value) => value.length === length || /\s/u.test(value[length] ?? ""))) return start.trim();
  const word = start.lastIndexOf(" ");
  return word > 0 ? start.slice(0, word).trim() : "";
}

function folded(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}
