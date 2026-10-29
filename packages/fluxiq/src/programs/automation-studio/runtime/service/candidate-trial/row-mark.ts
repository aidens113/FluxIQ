// What a trial's feedback suggests in place of a list of today's values (t790).
//
// **Why.** Run `run-mvswewhy-e4e469d4` asked for the rows of a set the request
// defines by each row's own relation to the person. Both trial judges advised
// a literal list of the values the page showed that day; Core noted it ("this
// advice lists values the request does not say", t785,
// `../../result-verification/listed-values/`), and the builder
// wrote the list anyway. The structure it had read offered the mark that made a
// row one the request asks for, and nothing named it as the alternative.
//
// **What Core holds, and so what this can say.** At the trial's feedback Core
// holds the run's summary: each read's stored rows (a few per record set,
// `sampleRows`) and, per condition, the rows it alone left out with every
// column the read declares (`leftOutCells`). Those are the read's own columns
// only. The read's structure -- every field a detection offered, with its label
// and coverage -- is the domain's evidence in the builder's history, never
// parsed by Core, so it is never in reach here. So:
//
// - where the rows Core holds show a column of the read whose value marks the
//   rows the advice's values pick out -- present on every one of them and on
//   none of the others, or starting with a part every one shares and none of
//   the others does -- the suggestion names that column and the condition;
// - otherwise it says the read's columns hold no such mark, and words where to
//   look in the structure the builder holds: a field present on some rows and
//   not others (a button, badge or label whose coverage is below 1), or one
//   whose value differs between the rows to keep and those to leave out.
//
// It fires only where Core's note fired, so a request that names its values
// gets nothing. It is advice, never a refusal, and it names no site: only the
// column ids the Flow wrote and, for a shared start, the screened text of the
// rows Core already holds.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioResultNotedListedValues } from "../../result-verification/listed-values/index.ts";
import type { AutomationStudioRunResultSummary } from "../../result-verification/index.ts";

/** What a screened or empty cell reads as in a summary row: never a value to compare. */
const NOT_A_VALUE: ReadonlySet<string> = new Set(["[withheld]", "(withheld)", "(no value)"]);
/** The shortest shared start worth testing; a shorter one is a letter or two any row may start with. */
const SHORTEST_START = 4;
/** A column id a sentence may name. */
const COLUMN = /^[A-Za-z0-9_.$@-]{1,64}$/u;

const LOOK_IN_STRUCTURE = "In the read's structure, look for a field present on some rows and not others -- a button, badge or label whose coverage is below 1 -- or a field whose value differs between the rows to keep and the rows to leave out; add it to the read's fields and test it with is: \"present\", is: \"absent\" or startsWith, instead of listing today's values.";

/** Core's suggestion beside a noted list of values (header); `undefined` where the advice carries no such note. */
export function automationStudioTrialRowMark(advice: string | undefined, summary: AutomationStudioRunResultSummary): string | undefined {
  const values = automationStudioResultNotedListedValues(advice ?? "").map(folded);
  if (values.length < 2) return undefined;
  for (const rows of rowsByRead(summary)) {
    const listedBy = listingColumn(rows, values);
    if (listedBy === undefined) continue;
    const listed = rows.filter((row) => values.includes(folded(row[listedBy] ?? "")));
    const others = rows.filter((row) => !values.includes(folded(row[listedBy] ?? "")));
    if (!listed.length || !others.length) continue;
    const mark = markOf(rows, listedBy, listed, others);
    const picked = `the rows whose ${listedBy} is one the advice lists (${listed.length} of the ${rows.length} rows of this read Core holds)`;
    if (mark) return `Core's record: ${mark.column} ${mark.said} on every one of ${picked} and on none of the other ${others.length}. A condition on that column, ${JSON.stringify(mark.condition)}, keeps a row by what the row itself shows rather than by today's values; check it against the request before you use it.`;
    return `Core's record: no column this read takes differs between ${picked} and the other ${others.length}, so what marks the rows the request asks for is not read yet. ${LOOK_IN_STRUCTURE}`;
  }
  return `Core holds no row of this trial's reads with the values the advice lists, so it cannot compare the rows they pick out with the others. ${LOOK_IN_STRUCTURE}`;
}

type Row = Record<string, string>;

/** Each read's rows Core holds: the stored rows of the sets its passes wrote, and the rows each of its conditions alone left out. */
function rowsByRead(summary: AutomationStudioRunResultSummary): Row[][] {
  return (summary.reads ?? []).map((read) => [
    ...summary.recordSets.filter((set) => (set.processing?.passes ?? []).some((pass) => pass.node === read.nodeId)).flatMap((set) => (set.sampleRows ?? []).map(rowOf)),
    ...(read.conditions ?? []).flatMap((condition) => (condition.leftOutCells ?? []).map((cells) => ({ ...cells })))
  ]).filter((rows) => rows.length > 0);
}

function rowOf(row: JsonObject): Row {
  return Object.fromEntries(Object.entries(row).flatMap(([column, value]) => (typeof value === "string" ? [[column, value]] : [])));
}

/** The column whose cells hold the most of the listed values, where any does. */
function listingColumn(rows: readonly Row[], values: readonly string[]): string | undefined {
  let best: { column: string; hits: number } | undefined;
  for (const column of new Set(rows.flatMap((row) => Object.keys(row)))) {
    if (!COLUMN.test(column)) continue;
    const hits = rows.filter((row) => values.includes(folded(row[column] ?? ""))).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { column, hits };
  }
  return best?.column;
}

/** A column other than the listing one that marks the listed rows: by having a value, lacking one, or a shared start. */
function markOf(rows: readonly Row[], listedBy: string, listed: readonly Row[], others: readonly Row[]): { column: string; said: string; condition: JsonObject } | undefined {
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
