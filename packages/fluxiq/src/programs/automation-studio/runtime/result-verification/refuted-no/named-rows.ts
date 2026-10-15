// The rows one sentence of a no names, found in Core's record (t607).
//
// A row is named as `../request-rows/checked-rows.ts` finds it: by an id of
// six or more letters and digits that exactly one stored row holds in a cell,
// or one left-out label holds, or that is Core's own short id for a label
// (`../request-rows/row-id.ts`); or by the start of its label that tells it
// apart from every other row of its read (`../request-rows/row-naming.ts`),
// each mention given to the longest label it spells. A stored row named by a
// prefix whose written price or decimal the row's cells contradict is not that
// row (`../request-rows/row-values.ts`, t489).
//
// **And what Core cannot find.** A quote of two words or more whose start is no
// named row's, or an id no row holds, names a row Core has no record of. A
// claim about such a row is one Core cannot refute, so the sentence's claim
// stands (`./weigh.ts`).

import {
  AutomationStudioRequestRowId,
  automationStudioRequestRowIds,
  automationStudioRequestRowNaming,
  automationStudioRequestRowValuesAgree,
  automationStudioRequestRowWords
} from "../request-rows/index.ts";
import type { AutomationStudioResultNoNamedRows, AutomationStudioResultNoRecord, AutomationStudioResultNoStoredRow } from "./types.ts";

/** The fewest words a prefix that names a row has, unless the label is shorter (`row-naming.ts`). */
const PREFIX_MIN_WORDS = 4;
/** An id that is a measure: digits, then a unit ("600MAH"). */
const MEASURE = /^\p{N}+\p{L}+$/u;
/** A quoted run of text. */
const QUOTED = /["“]([^"”]+)["”]/gu;
/** The words a quote's start is compared by. */
const QUOTE_START_WORDS = 3;

/** The rows a sentence names, and whether it names one Core holds no record of (header). */
export function automationStudioResultSentenceRows(sentence: string, record: AutomationStudioResultNoRecord): AutomationStudioResultNoNamedRows {
  const labels = new Set<string>();
  let unmatched = false;
  for (const id of automationStudioRequestRowIds(sentence)) {
    if (MEASURE.test(id)) continue;
    const label = labelOfId(id, record);
    if (label === undefined) unmatched = true;
    else labels.add(label);
  }
  for (const label of prefixNamed(sentence, record)) labels.add(label);
  const stored = record.stored.filter((row) => labels.has(row.label));
  const storedLabels = new Set(stored.map((row) => row.label));
  // A label the result holds is named as a stored row: a sentence saying it is missing is held to that.
  const leftOut = record.leftOut.filter((row) => labels.has(row.label) && !storedLabels.has(row.label));
  if (!unmatched) unmatched = quotesUnmatched(sentence, [...labels], record.says);
  return { stored, leftOut, unmatched };
}

/** The one label an id names: a stored row's cell, else a left-out label's text, else Core's short id for one label. */
function labelOfId(id: string, record: AutomationStudioResultNoRecord): string | undefined {
  const holders = new Set(record.stored.filter((row) => Object.values(row.cells).some((cell) => cell.toUpperCase().includes(id))).map((row) => row.label));
  if (holders.size > 1) return undefined;
  if (holders.size === 1) return [...holders][0];
  const every = [...new Set([...record.stored.map((row) => row.label), ...record.leftOut.map((row) => row.label)])];
  const inText = every.filter((label) => label.toUpperCase().includes(id));
  if (inText.length === 1) return inText[0];
  const own = every.filter((label) => AutomationStudioRequestRowId.of(label) === id);
  return own.length === 1 ? own[0] : undefined;
}

type Match = { label: string; start: number; end: number };

/** Each pool's labels with the prefix that names them, worked out once per record. */
const PREFIXES = new WeakMap<AutomationStudioResultNoRecord, Array<{ label: string; prefix: string[] }>>();

function prefixesOf(record: AutomationStudioResultNoRecord): Array<{ label: string; prefix: string[] }> {
  const known = PREFIXES.get(record);
  if (known) return known;
  const said = new Set<string>();
  const prefixes = record.pools.flatMap((pool) => pool.flatMap((label) => {
    const prefix = automationStudioRequestRowNaming(label, pool).prefix;
    const key = `${label}\u0000${prefix.join(" ")}`;
    if (said.has(key) || prefix.length < Math.min(PREFIX_MIN_WORDS, wordsOf(label).length)) return [];
    said.add(key);
    return [{ label, prefix }];
  }));
  PREFIXES.set(record, prefixes);
  return prefixes;
}

/** The labels a sentence names by a prefix, each mention the longest label's, a stored row's only where its written values agree. */
function prefixNamed(sentence: string, record: AutomationStudioResultNoRecord): string[] {
  const words = wordsOf(sentence);
  const found: Match[] = [];
  const seen = new Set<string>();
  for (const { label, prefix } of prefixesOf(record)) {
    for (let start = 0; start + prefix.length <= words.length; start += 1) {
      const key = `${label}\u0000${start}`;
      if (seen.has(key) || !prefix.every((word, index) => words[start + index] === word)) continue;
      seen.add(key);
      found.push({ label, start, end: start + prefix.length });
    }
  }
  const agreeing = found.filter((match) => valuesAgree(sentence, words.length, match, found, record.stored));
  const inside = (match: Match): boolean => agreeing.some((other) =>
    other.label !== match.label && other.start <= match.start && other.end >= match.end && other.end - other.start > match.end - match.start);
  return [...new Set(agreeing.filter((match) => !inside(match)).map((match) => match.label))];
}

/** Whether the values a sentence writes after a mention, up to the next mention, agree with a stored row by that label; true for a label no stored row has. */
function valuesAgree(sentence: string, wordCount: number, match: Match, found: readonly Match[], stored: readonly AutomationStudioResultNoStoredRow[]): boolean {
  const rows = stored.filter((row) => row.label === match.label);
  if (!rows.length) return true;
  const text = sentence.replace(/['’]/gu, "");
  const runs = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  if (runs.length !== wordCount) return true;
  const last = runs[match.end - 1]!;
  const next = found.filter((other) => other.start >= match.end).reduce((least, other) => Math.min(least, other.start), runs.length);
  const after = text.slice(last.index + last[0].length, next < runs.length ? runs[next]!.index : text.length);
  return rows.some((row) => automationStudioRequestRowValuesAgree(after, Object.values(row.cells)));
}

/** Whether a quote of two words or more starts as no named label does, and is not the request's own words (header). */
function quotesUnmatched(sentence: string, named: readonly string[], says: ((text: string) => boolean) | undefined): boolean {
  const starts = named.map((label) => wordsOf(label));
  for (const quote of sentence.matchAll(QUOTED)) {
    const pieces = quote[1]!.split("\u2026").filter((piece) => piece.trim());
    if (wordsOf(quote[1]!).length < 2 || (says && pieces.length > 0 && pieces.every((piece) => says(piece)))) continue;
    const words = wordsOf(pieces[0] ?? "");
    const start = words.slice(0, QUOTE_START_WORDS);
    if (!start.length || !starts.some((label) => start.every((word, index) => label[index] === word))) return true;
  }
  return false;
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

