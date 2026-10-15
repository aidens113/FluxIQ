// The rows a numeric bound, a presence test, or a text test left out that
// Core itself settles (t574, t599, t624, t636).
//
// **Why.** A yes over any row a condition alone left out has to quote, beside
// that row, the request's words excluding it (`../request-rows/unquoted-rows.ts`,
// t515). Live run `run-mv7vor5f-ea4d08b4`'s revisions 2 and 4 stored exactly
// the 13 rows asked for and left out 37 rows across six conditions; most were
// rows a rating or price bound left out, each said with the value it tested.
// The one yes was held because it did not argue each of the 37, and the
// recheck that listed all of them turned it into a no.
//
// **And a presence test (t599).** A8 everything-store `run-mv8id5vg-ed7b89fe`:
// t574 settled the numeric rows, and every one of 48 yeses over 12 exact
// answers was still held, on the rows a `column is present` condition (8) and
// a `column is absent` condition (4) alone left out. Each such row's witness
// -- the domain's own reading of that condition's value on that row -- said
// the value was absent (or present), which is exactly why the condition left
// it out; but the labels shared ten-word prefixes, so the judges could not name
// each row beside a quote, and no recheck passed.
//
// **What Core settles: only what it measured.** A row the condition alone left
// out that fails the condition by the domain's own reading:
//
// - **A numeric bound** (a bound, or `equals` a number, nothing else): the row
//   said `label — column: value`, whose value Core reads as a number
//   (`readAutomationStudioRecordNumber`) that fails the condition by Core's own
//   semantics (`automationStudioRecordConditionHolds`, the domain's condition
//   to the character).
// - **A presence test** (`is: present` or `is: absent`, possibly negated,
//   comparing nothing): the row whose witness (`leftOutObservations`, the
//   domain's read of the condition's value on that row, aligned with the rows)
//   says `absent` where the condition keeps only rows with the value, or
//   `present` where it keeps only rows without it. A witness that could not
//   read the value (`unavailable`, `withheld`), or no witness, settles nothing.
// - **A text test (t624)** (`contains`, `startsWith`, `endsWith`, `matches`, or
//   an `equals` of text only, possibly negated, with no bound and no presence
//   test beside it): the row whose aligned witness found the value (`present`)
//   and whose value, so read, fails the condition by Core's own semantics.
//   A8 bigbox `run-mv96rz6d-745e2940` stored the exact answer at step 0051 and
//   three times more; every yes was held because a text condition alone left
//   out nine rows, each witnessed with the value it failed on, and no judge
//   named all nine labels, which shared long prefixes, beside a quote.
//
// **And a row with no value at all (t636).** A8 social `run-mv9ml775-9872e63e`:
// a subflow trial over exactly the rows asked for was held through 8 yeses out
// of 8, on two kinds of left-out row Core had measured and never settled.
//
// - **A numeric bound's empty row**: one whose tested value the read found
//   empty -- its witness `absent`, or `present` with nothing in it, or, with no
//   witness, the row said `label — column: (no value)` -- is settled where the
//   condition, by Core's own semantics, fails on no value (a bound does; a
//   negated one holds, so it never left such a row out).
// - **A text test's absent row**: one whose witness found no value (`absent`)
//   is settled where the condition fails on no value: a `contains`,
//   `startsWith`, `endsWith`, `matches` or text `equals` that is not negated.
//   A negated one holds on no value, so its absent rows stay unsettled.
//
// Each kind's sentence says the read found no value, never that a value failed.
//
// A row whose value states no number and is not empty, a withheld value, a
// witness that could not read the value (`unavailable`, `withheld`), a text
// test's row with no witness or a value that passes it, or a row of a condition
// mixing a text test with a bound, is not settled, and is still quoted for row
// by row.
//
// **What a yes must still show.** That the condition is the request's: Core
// read the row against the condition as authored, not against the request. So
// the sentence says a yes quotes, once, in a sentence naming the condition, the
// request's words stating that bound -- or, for a presence test, asking for
// rows with (or without) that value; for a text test, asking for rows whose
// value says (or does not say) what the condition looks for -- and
// `../request-rows/unquoted-rows.ts` holds it to that; it need not quote
// beside each settled row. A text test can encode the request wrongly; the
// one quote, and each row's tested value shown beside it, are what guard that,
// as for a bound.

import { automationStudioRecordConditionHolds, readAutomationStudioRecordNumber, type AutomationStudioRecordCondition } from "@fluxiq/contracts/automation-studio";
import { automationStudioResultConditionName } from "../read-account/index.ts";
import type { AutomationStudioResultLeftOutObservation } from "../read-condition.ts";
import type { AutomationStudioResultReadCell } from "./condition-readings.ts";

/** The relations that compare a number. */
const BOUNDS = ["atLeast", "atMost", "lessThan", "greaterThan"] as const;
/** The relations that compare text. */
const TEXTS = ["matches", "contains", "startsWith", "endsWith"] as const;
/** What a left-out row says for an empty tested value (`../read-account/alone-rows.ts`). */
const NO_VALUE = "(no value)";

/** One left-out row as given, with its tested cell where the row says one, and its witness where the read sent one for every row. */
type LeftOutRow = { row: string; cell: AutomationStudioResultReadCell | undefined; witness?: AutomationStudioResultLeftOutObservation | null | undefined };

/**
 * The left-out rows Core settles for this condition, as given, and its
 * sentence (header); nothing when the condition is not a numeric bound, a
 * presence test or a text test, or no row is settled. `column` is the column
 * the condition tests, where one is known: a numeric bound settles nothing
 * without it.
 */
export function automationStudioResultSettledRows(input: {
  condition: AutomationStudioRecordCondition;
  column: string | undefined;
  number: number;
  wording: string | undefined;
  leftOut: readonly LeftOutRow[];
}): { leftOutSettled: string[]; settled: string } | undefined {
  const { condition, column } = input;
  const name = automationStudioResultConditionName(input.number, input.wording);
  const named = column === undefined ? name : `${name} or ${column}`;
  const keeps = presenceKept(condition);
  if (keeps) {
    // The witness says the value is the one the condition leaves out: absent for a test keeping rows with it, present for one keeping rows without it.
    const leaves = keeps === "present" ? "absent" : "present";
    const settled = input.leftOut.filter(({ witness }) => witness?.state === leaves);
    if (!settled.length) return undefined;
    const value = column ?? "the value it reads";
    const found = leaves === "absent" ? `found no ${value}` : `found ${value}`;
    const asks = keeps === "present" ? "only rows that have it" : "only rows without it";
    return {
      leftOutSettled: settled.map(({ row }) => row),
      settled: `On each row in leftOutSettled the read ${found}, so each fails ${name} as written: Core settled these rows, so a yes need not quote the request beside each of them. `
        + `It must still show the condition is the request's: quote, once, in a sentence that names ${named}, the request's own words asking for ${asks}. If the request asks no such thing, these rows are ones it asks for.`
    };
  }
  if (textOnly(condition)) return textSettled(input, name, named);
  if (column === undefined || !numericOnly(condition)) return undefined;
  // A bound fails on no value unless it is negated (header, t636).
  const failsEmpty = !automationStudioRecordConditionHolds(condition, undefined);
  const numbered = (entry: LeftOutRow) => entry.cell !== undefined && readAutomationStudioRecordNumber(entry.cell.value) !== undefined && !automationStudioRecordConditionHolds(condition, entry.cell.value);
  const empty = (entry: LeftOutRow) => failsEmpty && foundEmpty(entry, column);
  const settled = input.leftOut.filter((entry) => numbered(entry) || empty(entry));
  if (!settled.length) return undefined;
  const read = !settled.some(empty)
    ? `Core read ${column} as a number on each row in leftOutSettled, and each fails ${name} as written`
    : settled.every(empty)
      ? `On each row in leftOutSettled the read found no ${column}, and a row with no number fails ${name} as written`
      : `Core read ${column} on each row in leftOutSettled, and each fails ${name} as written: where the row states a number, that number fails it, and where the read found no ${column}, a row with no number fails every bound`;
  return {
    leftOutSettled: settled.map(({ row }) => row),
    settled: `${read}: Core settled these rows, so a yes need not quote the request beside each of them. `
      + `It must still show the bound is the request's: quote, once, in a sentence that names ${named}, the request's own words stating that bound. If the request states no such bound, these rows are ones it asks for.`
  };
}

/**
 * Whether the read found the row's tested value empty (header, t636): its
 * witness found none, or found it with nothing in it; with no witness, the row
 * said `(no value)` for this column. A witness that could not read the value
 * says nothing about it.
 */
function foundEmpty({ row, witness }: LeftOutRow, column: string): boolean {
  if (witness) return witness.state === "absent" || (witness.state === "present" && !witness.value.trim());
  return row.endsWith(` — ${column}: ${NO_VALUE}`);
}

/**
 * A text test's settled rows (header): each whose witness found the value and
 * whose value, as found, fails the condition as written. Its sentence names the
 * value by its column where one is known.
 */
function textSettled(input: { condition: AutomationStudioRecordCondition; column: string | undefined; leftOut: readonly LeftOutRow[] }, name: string, named: string): { leftOutSettled: string[]; settled: string } | undefined {
  // A text test fails on no value unless it is negated (header, t636).
  const failsAbsent = !automationStudioRecordConditionHolds(input.condition, undefined);
  const absent = ({ witness }: LeftOutRow) => failsAbsent && witness?.state === "absent";
  const settled = input.leftOut.filter((entry) => absent(entry) || (entry.witness?.state === "present" && !automationStudioRecordConditionHolds(input.condition, entry.witness.value)));
  if (!settled.length) return undefined;
  const value = input.column ?? "the value it tests";
  const none = input.column === undefined ? "no value to test" : `no ${input.column}`;
  const asks = input.condition.not === true ? "leaving out rows whose" : "asking only for rows whose";
  const read = !settled.some(absent)
    ? `On each row in leftOutSettled the read found ${value}, as that row's witness in leftOutObservations gives it, and Core tested that value against ${name} as written: each fails it`
    : settled.every(absent)
      ? `On each row in leftOutSettled the read found ${none}, as that row's witness in leftOutObservations gives it, and a row with no value fails ${name} as written`
      : `On each row in leftOutSettled the read found ${value} or found ${none}, as that row's witness in leftOutObservations gives it, and Core tested what it found against ${name} as written: each fails it, a row with no value as well`;
  return {
    leftOutSettled: settled.map(({ row }) => row),
    settled: `${read}, so Core settled these rows, and a yes need not quote the request beside each of them. `
      + `It must still show the condition is the request's: quote, once, in a sentence that names ${named}, the request's own words ${asks} ${value} says what the condition looks for. If the request asks no such thing, these rows are ones it asks for.`
  };
}

/** Whether the condition compares text and nothing else: a text relation, or an `equals` of text only, with no bound and no presence test. */
function textOnly(condition: AutomationStudioRecordCondition): boolean {
  if (BOUNDS.some((key) => condition[key] !== undefined) || condition.is !== undefined) return false;
  const equals = condition.equals === undefined ? [] : Array.isArray(condition.equals) ? condition.equals : [condition.equals];
  if (equals.some((entry) => typeof entry !== "string")) return false;
  return equals.length > 0 || TEXTS.some((key) => condition[key] !== undefined);
}

/** Whether the condition compares a number and nothing else: a bound or a numeric `equals`, no text test and no presence test. */
function numericOnly(condition: AutomationStudioRecordCondition): boolean {
  if (TEXTS.some((key) => condition[key] !== undefined) || condition.is !== undefined) return false;
  const equals = condition.equals === undefined ? [] : Array.isArray(condition.equals) ? condition.equals : [condition.equals];
  if (equals.some((entry) => typeof entry !== "number")) return false;
  return equals.length > 0 || BOUNDS.some((key) => condition[key] !== undefined);
}

/**
 * For a presence test -- a condition comparing nothing, which asks only whether
 * its value is there (`automationStudioRecordConditionHolds`) -- whether it
 * keeps the rows with the value or those without it, `not` taken into
 * account; `undefined` for any condition that compares.
 */
function presenceKept(condition: AutomationStudioRecordCondition): "present" | "absent" | undefined {
  if (BOUNDS.some((key) => condition[key] !== undefined) || TEXTS.some((key) => condition[key] !== undefined) || condition.equals !== undefined) return undefined;
  return (condition.is !== "absent") !== (condition.not === true) ? "present" : "absent";
}
