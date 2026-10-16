// Whether a condition tests a row's own label (t651): its tested value is the
// name the row is listed by, so a row failing it says only that its name does
// not say the condition's text.
//
// **Why.** A8 frozen pair 4, candidate towels `run-mva446jf-926a3c72`: a read
// kept rows by `retailer startsWith "<house name>"`, where the column it called
// `retailer` was read from the product's title, as a stand-in for "sold by the
// store itself". The house name is a word of the request, so t629's test
// (`./request-text-test.ts`) counted the condition as the request's own words,
// and every row it left out as failing them. Core then refuted four correct
// judges and, through t641, held the condition, though 7 of its 8 left-out
// rows were rows the request asks for. Core had measured only that a name does
// not start with a word -- never that the column holds what the request's word
// is about (who sells the row). So such a condition is never read as the
// request's own words (`./record.ts`, `requestQuotes`): it neither refutes a no
// nor accounts for a row it left out (`./record-conditions.ts`, t631, t641).
//
// **What counts, each from Core's own record and nothing a model wrote.**
//
// - The account marks it as testing the label column (`testedLabel`,
//   `../read-account/accounts.ts`).
// - A row it alone left out has a witness value, read by Core, that is that
//   row's own label.
// - The value it read on a row it kept (`(read "…" on a row it kept)`,
//   `../read-account/condition.ts`) is a stored row's label.
// - Its column is a stored column, and on a stored row it holds that row's
//   label.
//
// Values are compared folded (case, runs of space, a closing stop), and only
// whole: a column whose value merely starts a label (a brand beside a title)
// is a column of its own, and stays one the request's words can settle.
//
// **And a link to the row itself (t659).** A8 frozen pair 6 project towels
// `run-mvac0nmw-52ed30b2` step 0047: a `seller` column read from the product's
// own link, whose path was the product's name, was held as the request's own
// words. Such a value is never equal to the label, so the whole comparison
// missed it. So a left-out row's witness that is a link whose path spells that
// row's label, or a value read on a kept row that is a link spelling a stored
// row's label (`automationStudioResultLinkSpellsLabel`, below), marks the condition as testing the label
// too: Core measured an address, not who sells the row. A column holding words
// of its own ("City Library") is no link, and stays one the request can settle.

import type { AutomationStudioResultReadCondition } from "../contracts/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";
import type { AutomationStudioResultNoStoredRow } from "./types.ts";

/** What the condition's wording says its read found on a kept row (`../read-account/condition.ts`). */
const FOUND_ON_KEPT = /\(read ("(?:[^"\\]|\\.)*") on a row it kept\)/u;
/** A column key, then a text relation: the subject of a text test as its account words it. */
const COLUMN_TESTED = /^([A-Za-z_][\w-]*) (?:not )?(?:contains|equals|startsWith|endsWith|matches)\b/u;
/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** Whether the condition tests a row's own label (header); `stored` the rows the result holds. */
export function automationStudioResultConditionTestsLabel(condition: AutomationStudioResultReadCondition, stored: readonly AutomationStudioResultNoStoredRow[]): boolean {
  if (condition.testedLabel === true) return true;
  const rows = condition.leftOutOnlyByThis ?? [];
  const observations = condition.leftOutObservations ?? [];
  for (const [at, row] of rows.entries()) {
    const witness = observations[at];
    const label = automationStudioRequestRowLabel(row);
    if (witness?.state === "present" && label !== WITHHELD_LABEL && (same(witness.value, label) || automationStudioResultLinkSpellsLabel(witness.value, label))) return true;
  }
  const wording = condition.condition ?? "";
  const kept = keptValue(wording);
  if (kept !== undefined && stored.some((row) => same(kept, row.label) || automationStudioResultLinkSpellsLabel(kept, row.label))) return true;
  const column = COLUMN_TESTED.exec(wording.replace(FOUND_ON_KEPT, "").replace(/\s+/gu, " ").trim())?.[1];
  return column !== undefined && stored.some((row) => row.cells[column] !== undefined && same(row.cells[column]!, row.label));
}

/** The value the wording says the read found on a kept row, its quote and escaped quotes undone; none where it says none. */
function keptValue(wording: string): string | undefined {
  const said = FOUND_ON_KEPT.exec(wording)?.[1];
  return said === undefined ? undefined : said.slice(1, -1).replace(/\\(["\\])/gu, "$1");
}

/** Whether two texts are one value, compared folded (header). */
function same(left: string, right: string): boolean {
  const folded = fold(left);
  return folded.length > 0 && folded === fold(right);
}

/** A text as values are compared: lower case, each run of spaces one, no closing stop or comma (as `./record.ts` folds). */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}

// Whether a value Core read is a link to the row itself (t659): an address,
// absolute or root-relative, whose path spells the row's own label, its words
// in order.
//
// **Why.** A8 frozen pair 6 project towels `run-mvac0nmw-52ed30b2` step 0047:
// a read kept rows by `seller contains "<house name>"`, where the column it
// called `seller` was read from the product's own link, and the link's path was
// the product's name. The house name is a word of the request, so Core counted
// the condition as the request's own words and held it. Core had measured only
// that an address does not spell a word -- never who sells the row. A link to
// the row is its label said as an address, so it is told apart as t651 tells a
// row's own name (above).
//
// **What counts.** The value starts `http://`, `https://` or a single `/`; its
// path (before any `?` or `#`), decoded, read into words of letters and digits;
// and the label's words, read the same way, at least two of them, appear in
// that path in their order. Nothing a model wrote is read.

/** An absolute address, its host taken off: what follows is its path. */
const ABSOLUTE = /^https?:\/\/[^/?#\s]+/iu;
/** A root-relative address: one slash, not two. */
const ROOT_RELATIVE = /^\/(?!\/)/u;
/** The fewest words a label must have for its path to be told apart from chance. */
const LEAST_WORDS = 2;

/** Whether `value` is a link whose path spells `label`'s words in order (header). */
export function automationStudioResultLinkSpellsLabel(value: string, label: string): boolean {
  const text = value.trim();
  const absolute = ABSOLUTE.exec(text);
  if (!absolute && !ROOT_RELATIVE.test(text)) return false;
  const path = (absolute ? text.slice(absolute[0].length) : text).split(/[?#]/u)[0] ?? "";
  const wanted = wordsOf(label);
  if (wanted.length < LEAST_WORDS) return false;
  const words = wordsOf(decoded(path));
  let at = 0;
  for (const word of words) if (word === wanted[at]) at += 1;
  return at >= wanted.length;
}

/** The words of a text as a link and a label are compared: lower case, apostrophes joined, runs of letters and digits. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/['’]/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** A path with its escapes undone; as written where it holds a broken one. */
function decoded(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
