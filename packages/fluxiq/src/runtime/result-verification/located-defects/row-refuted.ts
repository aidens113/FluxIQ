// A defect row Core's own record of that row refutes (t810, framework plan
// P5b). Run `run-mvud43a2-445c7f17`: a Flow stored exactly the rows asked for,
// and every judge said no, calling four left-out rows missing. Three were items
// that showed the person an offer to enter the set they belong to -- so the
// person is not in it, and a request for the person's own sets does not ask
// for them -- and the fourth was given a value in a column whose own cell says
// another. Core held both facts and could only call the no unsupported, so a
// correct Flow ended unverified. Two kinds of evidence refute a row now, never
// by prose, each quoted:
//
// - `outside_mark`: an `asked_missing` row that is a row a read left out, every
//   record of which carries an `outside` mark the client read on its item
//   (`AutomationStudioResultItemMark`), where the request's words the defect
//   quotes ask for the person's own set (`asksOwnSet` below). A record whose
//   read sent no marks at all, with cells the same as a marked record's, is
//   that same item seen by another read and does not block (t810 follow-up 2);
//   a record the client read and found no offer on always blocks, and so does
//   an unmarked record that may be another item. A read that sent no marks may
//   still have read every item: the marks reader leaves out a list in which no
//   row has one (`../left-out-cells/left-out-marks.ts`), so "not sent" is never
//   taken as "could not read". The quote is the
//   mark's own words, and the entity it names where the client could tell.
// - `cell_differs`: the defect names a column and a value, and every record of
//   the row Core holds -- a left-out row's own cells for `asked_missing`, a
//   stored row's for `kept_not_asked` -- has a cell of that column that is not
//   empty and, compared as the located defects compare a cell, neither is the
//   value, nor holds it, nor is held by it. The quote is the cell.
// - `not_kept`: a `kept_not_asked` or `wrong_value` defect -- a claim about a
//   row the result keeps -- whose row Core finds only as a row a read left out,
//   never a stored one. The quote is the condition, or the conditions
//   together, that left it out. Run `run-mvud43a2-445c7f17`'s re-asks
//   (0065/0066) recast the refuted row as a wrong value of the result; the
//   result never held it.
//
// A refuted defect is never located: Core's record of the row says the claim
// is wrong, which is more than not finding it. What a no whose every defect is
// refuted comes to is `../agreement/unsupported-no.ts`.
//
// **The own-set guard, kept small.** A quote asks for the person's own set
// where it speaks in the first person (I, me, my, we, us, our and their forms)
// and negates nothing (not, no, never, none, nor, neither, without, except,
// excluding, unless, cannot, or a word ending n't). "every notice of the
// circles I belong to" asks for it; "notices of a circle I have not entered"
// speaks of what is outside it, and "every notice of a circle" of no person,
// so a mark refutes neither. Core knows only "an item marked outside the
// person's set", never what kind of set or offer the client found.

import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioResultNoStoredRow } from "../refuted-no/index.ts";
import type { AutomationStudioResultLeftOutRowRecord } from "./row-cells.ts";

/** How Core's record of a row refutes the defect naming it (header), its quote of that evidence, and Core's sentence saying so. */
export type AutomationStudioResultDefectRowRefutation = { evidence: "outside_mark" | "cell_differs" | "not_kept"; quote: string; finding: string };

/** The first person, as a whole word, after an apostrophe is read as a word break ("I'm" is I). */
const FIRST_PERSON = /\b(?:i|me|my|mine|myself|we|us|our|ours|ourselves)\b/u;
/** A negation, as a whole word, or a word ending n't. */
const NEGATION = /\b(?:not|no|never|none|nor|neither|without|except|excluding|unless|cannot)\b|n't\b/u;

/**
 * Whether Core's record of the row a defect names refutes it (header), and
 * how; nothing where it does not. `rows` are the rows the defect names, as
 * `./located-defects.ts` found them: stored, or the records of a left-out row.
 */
export function automationStudioResultDefectRowRefuted(
  defect: AutomationStudioLlmVerificationDefect,
  rows: { stored: readonly AutomationStudioResultNoStoredRow[]; records: readonly AutomationStudioResultLeftOutRowRecord[]; leftOut?: ReadonlyArray<{ condition: string }> },
  quoted: string
): AutomationStudioResultDefectRowRefutation | undefined {
  if (defect.kind !== "asked_missing" && defect.kind !== "kept_not_asked" && defect.kind !== "wrong_value") return undefined;
  // A claim about a kept row that names only a row a read left out (header, `not_kept`).
  if (defect.kind !== "asked_missing" && !rows.stored.length) {
    const leftBy = [...new Set([...rows.records.flatMap((record) => (record.leftBy ? [record.leftBy] : [])), ...(rows.leftOut ?? []).map((row) => row.condition)])];
    if (!leftBy.length) return undefined;
    const quote = `left out by ${leftBy.join(" or ")}`;
    return { evidence: "not_kept", quote, finding: `${quoted} is no row the result holds: a read saw it, and it was left out, by ${leftBy.join(" or ")}, so no claim about a kept row holds of it.` };
  }
  if (defect.kind === "wrong_value") return undefined;
  if (defect.kind === "asked_missing" && !rows.stored.length && rows.records.length && asksOwnSet(defect.requestWords)) {
    const outside = (record: AutomationStudioResultLeftOutRowRecord) => record.marks.find((mark) => mark.kind === "outside");
    const marked = rows.records.filter((record) => outside(record));
    const sameItem = (record: AutomationStudioResultLeftOutRowRecord) => !record.marksRead && !record.marks.length && Object.keys(record.cells).length > 0
      && marked.some((one) => sameCells(one.cells, record.cells));
    const mark = marked[0] ? outside(marked[0]) : undefined;
    if (mark && rows.records.every((record) => outside(record) || sameItem(record))) {
      const quote = `"${mark.said}"${mark.entity ? ` for "${mark.entity}"` : ""}`;
      return { evidence: "outside_mark", quote, finding: `Core's record of ${quoted} is a row a read left out whose item showed the person ${quote}, an offer to enter a set the person is not in, so the request's words "${defect.requestWords}" do not ask for it.` };
    }
  }
  const cells = defect.kind === "kept_not_asked" ? rows.stored.map((row) => row.cells) : rows.stored.length ? [] : rows.records.map((record) => record.cells).filter((row) => Object.keys(row).length > 0);
  const differs = cellsDiffer(defect, cells);
  if (!differs) return undefined;
  const quote = `${defect.column}: ${differs}`;
  return { evidence: "cell_differs", quote, finding: `Core's record of ${quoted} holds ${differs} in "${defect.column}", not "${defect.value}".` };
}

/** Whether two records' cells are the same, column by column, as cells are compared. */
function sameCells(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => fold(left[key] ?? "") === fold(right[key] ?? ""));
}

/** Whether the request's words a defect quotes ask for the person's own set (header): first person, nothing negated. */
function asksOwnSet(requestWords: string): boolean {
  const words = requestWords.toLowerCase().replace(/[‘’`´]/gu, "'");
  return FIRST_PERSON.test(words) && !NEGATION.test(words);
}

/**
 * The cells, quoted, where every record holds a cell of the defect's column
 * that is not empty and differs from its value (header); nothing otherwise.
 * The column by its own name where a row has it, else the one column whose
 * name holds it or it holds, as `./located-defects.ts` resolves one.
 */
function cellsDiffer(defect: AutomationStudioLlmVerificationDefect, cells: ReadonlyArray<Readonly<Record<string, string>>>): string | undefined {
  const column = bare(defect.column ?? "");
  const value = fold(defect.value ?? "");
  if (!column || !value || !cells.length) return undefined;
  const held: string[] = [];
  for (const row of cells) {
    const keys = Object.keys(row);
    const exact = keys.filter((key) => bare(key) === column);
    const near = keys.filter((key) => Math.min(bare(key).length, column.length) >= 3 && (bare(key).includes(column) || column.includes(bare(key))));
    const named = exact.length ? exact : near.length === 1 ? near : [];
    const own = named.map((key) => row[key] ?? "");
    if (!own.length || own.some((cell) => !fold(cell) || fold(cell).includes(value) || value.includes(fold(cell)))) return undefined;
    held.push(...own);
  }
  return [...new Set(held)].map((cell) => `"${cell}"`).join(" or ");
}

/** A cell as cells are compared: lower case, each run of spaces one, no closing stop or comma. */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}

/** A column name as columns are compared: letters and digits only, lower case. */
function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
