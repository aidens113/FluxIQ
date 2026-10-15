// Core's check of the rows a refutation names, against what the run holds.
//
// **Why.** Live run `run-muw60j7c-bb7c9a62` (debug C-5): the result judges
// refuted rightly, but said the Plus condition "alone excluded 6 rows that
// satisfy the request, including ... B0J5MCMBAY ... B07Z1RZGJG". Both rows are
// in the stored result; the Plus condition left out two other rows of the same
// product lines. The re-author followed that reading and discarded the exact
// 13-row answer it held. A repair cannot tell a judge's misreading from its
// reading; Core can, for any row the judge names.
//
// **What is matched.** The rows the judgement names: an id of six or more
// letters and digits, against every stored cell (a row's link carries its
// catalogue number) and every label; a label prefix that tells a row apart from
// the rest of its read (`row-naming.ts`), against stored and left-out labels.
// A sentence that names a row and says it was left out, dropped, excluded,
// rejected, omitted or missing calls that row left out.
//
// **Only a left-out word said of the run (t474).** Lane C round 9
// (`run-mv5q4j5c-49bfb5e2`, trials 2 and 4) was twice told that correct advice
// was "not supported". Trial 2's judges wrote "Two are accessories the request
// excludes: <two stored rows>", and the word `excludes`, whose subject there is
// the request, was read as the Flow having left both out. A left-out word says
// what the run did only when it is not said of the request (`ASKED_BY`: "the
// request excludes", "the instruction says to leave out"), nor as what should
// happen or did not (`NOT_DONE`: "should be excluded", "a condition to exclude",
// "was not dropped"; `NONE_DID`: "no condition that excludes").
//
// **A mention belongs to the longest label it spells (t474).** Trial 4's judges
// named the left-out "... Ivory with Wireless Charging Case"; the stored
// "... Ivory" is a strict prefix of it, so its whole label is its prefix and
// the mention matched both. Where one row's matched words lie inside another
// row's longer match in the same sentence, the mention is the longer row's.
// And a measure (`MEASURE`: "600mAh") a title carries is no row's id unless it
// is the whole of one row's cell: trial 2 named a charging case by its capacity.
//
// **A name is matched with the values written beside it (t489).** Lane C
// round 13 (`run-mv66s8yl-fbbfa221`, 0032) named a left-out row as "<title>,
// $50.00, 4.6"; the title's four-word start was also a stored row's, at another
// price and rating, and the left-out row was in no witness list, so the prefix
// named the stored row and a correct judge was called misread. A prefix now
// names a stored row only when the prices and decimal values written after it,
// up to the next row the sentence names, agree with that row's cells
// (`row-values.ts`); otherwise it names a row Core does not hold.
//
// **What is said, in Core's words.** A named row no condition left out alone
// that is in the result, although the judgement calls it left out: the check
// misread which rows were left out, and advice resting on that reading is not
// supported. And per condition, the named rows that condition really left out
// alone. Nothing of the judgement is copied but the labels and ids it matched.
//
// **And Core's short id (t599).** An id no row holds names the one label whose
// Core id it is (`row-id.ts`): the judge's copy shows it before each left-out
// row a judge must still name.
//
// **A left-out word belongs to the rows a condition left out (t628).** A8
// bigbox `run-mv9a4aj0-f9a81d13` step 0086: a judge wrote that the stored rows
// include a kept row of the wrong kind "and, on the read's own evidence, <two
// rows> were seen and only excluded by rating". Both rows were ones that
// condition alone left out; the word `excluded` was given to the kept row too,
// and correct advice was called "not supported". In a sentence that names a row
// a condition of the read left out, its left-out word belongs to the rows it
// left out, and a stored row it names is called left out only where a left-out
// word said of the run comes before it, as in "the condition excluded six
// rows, including <a stored row>" (t474's origin, `run-muw60j7c-bb7c9a62`).

import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { AutomationStudioRequestRowId } from "./row-id.ts";
import { automationStudioRequestRowNaming } from "./row-naming.ts";
import { automationStudioRequestRowValuesAgree } from "./row-values.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsRead, AutomationStudioRequestRowsStored } from "./types.ts";
import { automationStudioRequestRowIds, automationStudioRequestRowWords } from "./words.ts";

/** Words that say a row was left out. */
const LEFT_OUT = /\b(left out|leaves? out|leaving out|drop(s|ped|ping)?|exclud(e|es|ed|ing)|reject(s|ed|ing)?|omit(s|ted|ting)?|missing|misses|missed|filtered out|filters out)\b/giu;
/** What comes before a left-out word said of the request: its noun, then only words of asking ("the request explicitly excludes", "the instruction says to leave out"). */
const ASKED_BY = /\b(?:request|requests|instruction|instructions|task|user|prompt)(?:['’]s)?(?:\s+(?:explicitly|expressly|clearly|also|specifically|says?|said|asks?|asked|wants?|wanted|means|meant|to|and))*\s+$/iu;
/** What comes before a left-out word said as what should happen, or did not ("should be excluded", "a condition to exclude", "was not dropped", "wasn't filtered out"). */
const NOT_DONE = /(?:\b(?:should|must|would|could|ought to|needs? to|has to|have to|to|not|never|no longer)|n['’]t)(?:\s+(?:also|be|been|being|have|\w+ly))*\s+$/iu;
/** What comes before a left-out word whose subject is nothing: "no condition excludes", "has no condition that excludes". */
const NONE_DID = /\bno(?:\s+[\p{L}-]+){1,2}(?:\s+(?:that|which))?\s+$/iu;
/** An id that is a measure: digits, then a unit ("600MAH"). */
const MEASURE = /^\p{N}+\p{L}+$/u;
/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|approx|incl)\./giu;

/** A row the judgement named: its label, the ids it was named by, and whether a sentence naming it called it left out. */
type Named = { label: string; ids: Set<string>; calledLeftOut: boolean };

/** One mention of a row in a sentence: its label, the id it was named by, and where in the sentence it starts. */
type Mention = { label: string; id?: string; at: number };

/** Core's lines on the rows a judgement names; none when it names no row the run holds. */
export function automationStudioResultCheckedRows(summary: AutomationStudioRunResultSummary, judgement: string): string[] {
  const { reads, stored } = automationStudioRequestRowsReads(summary);
  if (!reads.length && !stored.length) return [];
  const named = new Map<string, Named>();
  const note = (label: string, id: string | undefined, calledLeftOut: boolean): void => {
    const entry = named.get(label) ?? { label, ids: new Set<string>(), calledLeftOut: false };
    if (id) entry.ids.add(id);
    entry.calledLeftOut ||= calledLeftOut;
    named.set(label, entry);
  };
  const everyLabel = [...new Set([...stored.map((row) => row.label), ...reads.flatMap((read) => read.labels)])];
  // A label short of four words is not matched by prefix: too few words tell a row apart by chance.
  const prefixes = reads.flatMap((read) => read.labels.map((label) => ({ label, prefix: automationStudioRequestRowNaming(label, read.labels).prefix })))
    .filter((entry) => entry.prefix.length >= 4);
  const conditioned = new Set(reads.flatMap((read) => read.conditions.flatMap((condition) => condition.labels)));
  for (const sentence of sentences(judgement)) {
    const leftOutAt = firstLeftOut(sentence);
    const mentions: Mention[] = [];
    const upper = sentence.toUpperCase();
    for (const id of automationStudioRequestRowIds(sentence)) {
      if (MEASURE.test(id) && !wholeCellOfOne(stored, id)) continue;
      const holders = new Set(stored.filter((row) => row.cells.some((cell) => cell.toUpperCase().includes(id))).map((row) => row.label));
      if (!holders.size) for (const label of everyLabel) if (label.toUpperCase().includes(id)) holders.add(label);
      // An id no row holds may be Core's own for one label (header).
      if (!holders.size) for (const label of everyLabel) if (AutomationStudioRequestRowId.of(label) === id) holders.add(label);
      // An id more than one row holds names none of them.
      if (holders.size === 1) mentions.push({ label: [...holders][0]!, id, at: upper.indexOf(id) });
    }
    mentions.push(...longestNamed(sentence, prefixes, stored));
    // Where the sentence names a row a condition left out, its left-out word is that row's; a stored row's only where said before it (header, t628).
    const namesConditioned = mentions.some((mention) => conditioned.has(mention.label));
    for (const mention of mentions) {
      const calledLeftOut = leftOutAt >= 0 && (!namesConditioned || conditioned.has(mention.label) || leftOutAt < mention.at);
      note(mention.label, mention.id, calledLeftOut);
    }
  }
  return lines([...named.values()], reads, new Set([...stored.map((row) => row.label), ...reads.flatMap((read) => read.inResult)]));
}

function lines(named: readonly Named[], reads: readonly AutomationStudioRequestRowsRead[], inResult: ReadonlySet<string>): string[] {
  const misread: string[] = [];
  const byCondition = new Map<string, { where: string; condition: string; rows: string[] }>();
  for (const row of named) {
    const leftOutBy = reads.flatMap((read) => read.conditions.filter((condition) => condition.labels.includes(row.label)).map((condition) => ({ read, condition })));
    if (leftOutBy.length) {
      for (const { read, condition } of leftOutBy) {
        const where = whereOf(read);
        const key = `${where}\u0000${condition.condition}`;
        const entry = byCondition.get(key) ?? { where, condition: condition.condition, rows: [] };
        entry.rows.push(`${said(row)}${inResult.has(row.label) ? " (also in the result)" : ""}`);
        byCondition.set(key, entry);
      }
    } else if (row.calledLeftOut && inResult.has(row.label)) {
      misread.push(`${said(row)} is in the result, although the check calls it left out: the check misread which rows were left out; advice resting on that reading is not supported.`);
    }
  }
  const alone = [...byCondition.values()].map((entry) =>
    `${entry.where}: the ${entry.condition} alone left out ${entry.rows.length === 1 ? "this row" : "these rows"} the check names: ${entry.rows.join("; ")}.`);
  return [...misread, ...alone];
}

/** A row as a line names it: its label, then the ids the judgement named it by. */
function said(row: Named): string {
  return row.ids.size ? `${row.label} (${[...row.ids].join(", ")})` : row.label;
}

function whereOf(read: AutomationStudioRequestRowsRead): string {
  return read.step !== undefined ? `Step ${read.step}` : `Read ${read.nodeId}`;
}

/** Where a sentence first says the run left something out: a left-out word not said of the request, nor as what should happen or did not; -1 where it never does. */
function firstLeftOut(sentence: string): number {
  for (const match of sentence.matchAll(LEFT_OUT)) {
    const before = sentence.slice(0, match.index);
    if (!ASKED_BY.test(before) && !NOT_DONE.test(before) && !NONE_DID.test(before)) return match.index!;
  }
  return -1;
}

/** Whether exactly one stored row has a cell that is this id and nothing else. */
function wholeCellOfOne(stored: readonly AutomationStudioRequestRowsStored[], id: string): boolean {
  return stored.filter((row) => row.cells.some((cell) => cell.trim().toUpperCase() === id)).length === 1;
}

/**
 * The labels a sentence names by prefix, each with where its first mention
 * starts (t628), each mention given to the longest
 * label it spells: a match that lies inside another label's longer match in
 * the same sentence is that label's, not its own. A mention of a stored row
 * whose written values its cells contradict names no row it holds (header, t489).
 */
function longestNamed(sentence: string, prefixes: ReadonlyArray<{ label: string; prefix: readonly string[] }>, stored: readonly AutomationStudioRequestRowsStored[]): Mention[] {
  const words = automationStudioRequestRowWords(sentence).map((word) => word.word);
  const found: Array<{ label: string; start: number; end: number }> = [];
  for (const { label, prefix } of prefixes) {
    for (let start = 0; start + prefix.length <= words.length; start += 1) {
      if (prefix.every((word, index) => words[start + index] === word)) found.push({ label, start, end: start + prefix.length });
    }
  }
  const matches = found.filter((match) => valuesAgree(sentence, words.length, match, found, stored));
  const inside = (match: { label: string; start: number; end: number }): boolean => matches.some((other) =>
    other.label !== match.label && other.start <= match.start && other.end >= match.end && other.end - other.start > match.end - match.start);
  // Each mention's place in the sentence: its first word's, by the same runs of letters and digits the words are, apostrophes dropped
  // (`words.ts`); where the runs do not line up, its end, so a left-out word in it is said before the mention, as before t628.
  const kept: number[] = [];
  for (let index = 0; index < sentence.length; index += 1) if (sentence[index] !== "'" && sentence[index] !== "’") kept.push(index);
  const runs = [...sentence.replace(/['’]/gu, "").matchAll(/[\p{L}\p{N}]+/gu)];
  const at = (start: number): number => runs.length === words.length ? kept[runs[start]!.index]! : sentence.length;
  const mentions: Mention[] = [];
  for (const match of matches.filter((one) => !inside(one)).sort((one, other) => one.start - other.start)) {
    if (!mentions.some((mention) => mention.label === match.label)) mentions.push({ label: match.label, at: at(match.start) });
  }
  return mentions;
}

/**
 * Whether what the sentence writes after a mention, up to the next mention or
 * its end, agrees with the cells of a stored row by that label (`row-values.ts`);
 * true for a label no stored row has, which has no cells to contradict.
 */
function valuesAgree(sentence: string, wordCount: number, match: { label: string; start: number; end: number }, found: ReadonlyArray<{ start: number }>, stored: readonly AutomationStudioRequestRowsStored[]): boolean {
  const rows = stored.filter((row) => row.label === match.label);
  if (!rows.length) return true;
  // The words are the sentence's runs of letters and digits, apostrophes dropped (`words.ts`): the same runs here give each word's place.
  const text = sentence.replace(/['’]/gu, "");
  const runs = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  if (runs.length !== wordCount) return true;
  const last = runs[match.end - 1]!;
  const next = found.filter((other) => other.start >= match.end).reduce((least, other) => Math.min(least, other.start), runs.length);
  const after = text.slice(last.index + last[0].length, next < runs.length ? runs[next]!.index : text.length);
  return rows.some((row) => automationStudioRequestRowValuesAgree(after, row.cells));
}

/** The judgement's sentences and clauses: a full stop, semicolon or line ends one, an abbreviation's stop does not. */
function sentences(text: string): string[] {
  return text.replace(ABBREVIATIONS, (match) => match.replace(/\./gu, "")).split(/(?<=[.;!?])\s+|\n+/u).filter((sentence) => sentence.trim());
}
