// What a rerun of a read did to the rows Core's check of the last test named as
// left out: which it keeps now, which it still leaves out, and Core's sentence
// saying so.
//
// **Why (live run `run-mux6naez-6c20f26e`, R3-3).** The first test's judgement
// said, in Core's words, that step 9's condition "name" alone left out Lumo
// Audio Drift Pro and two more. The repair's first rerun of that read kept all
// three (13 rows); nothing told the model so, and it reran the same read six
// more times (about $0.02) instead of completing. Its judgement stayed the first
// test's, and the rerun's answer gave counts, not which named rows came back.
//
// **How a rerun's row is matched to a named row**, the way the check matched
// the judge's words to rows (`checked-rows.ts`, `row-naming.ts`): the same label,
// word for word (case, punctuation and plurals aside); or an id of six or more
// letters and digits the named row was named by or carries, held by that rerun
// row alone; or the named row's distinguishing prefix of at least four words
// among the named and rerun labels, starting exactly one rerun row. A rerun row
// said with its tested value (`label — column: value`) is read by its label, and
// a withheld one matches nothing.
//
// **What is said.** Core's words only: the rows by their labels, the conditions
// that left them out, and -- when every one is kept -- to complete, so the Flow
// is tested from its start and judged again.

import { automationStudioRequestRowNaming } from "./row-naming.ts";
import { automationStudioRequestRowLabel } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsAfterRerun, AutomationStudioRequestRowsNamed } from "./types.ts";
import { automationStudioRequestRowIds, automationStudioRequestRowWords } from "./words.ts";

/** How a withheld label is written (`../read-account/alone-rows.ts`). */
const WITHHELD = "(withheld)";
/** The fewest words a prefix that matches a row has (`row-naming.ts`). */
const PREFIX_MIN_WORDS = 4;

/**
 * The named rows a rerun's rows (`labels`, as a replayed read's `readRows.rows`
 * are made, `../build-test/read-rows.ts`) keep and still leave out, and Core's
 * sentence; nothing when the check named no row. `step` is the rerun's step, for
 * the sentence.
 */
export function automationStudioRequestRowsAfterRerun(named: readonly AutomationStudioRequestRowsNamed[], labels: readonly string[], step?: number): AutomationStudioRequestRowsAfterRerun | undefined {
  const rows = new Map<string, Set<string>>();
  for (const entry of named) {
    for (const row of entry.rows) {
      const ids = rows.get(row.label) ?? new Set<string>();
      for (const id of [...(row.ids ?? []), ...automationStudioRequestRowIds(row.label)]) ids.add(id.toUpperCase());
      rows.set(row.label, ids);
    }
  }
  if (!rows.size) return undefined;
  const rerun = [...new Set(labels.map(automationStudioRequestRowLabel).filter((label) => label !== WITHHELD && label.trim()))];
  const pool = [...rows.keys(), ...rerun];
  const kept: string[] = [];
  const stillLeftOut: string[] = [];
  for (const [label, ids] of rows) (keeps(label, ids, rerun, pool) ? kept : stillLeftOut).push(label);
  return { kept, stillLeftOut, said: said(named, kept, stillLeftOut, step) };
}

/** Whether a rerun row is the named row (see the header). */
function keeps(label: string, ids: ReadonlySet<string>, rerun: readonly string[], pool: readonly string[]): boolean {
  const key = wordsOf(label);
  if (rerun.some((other) => same(wordsOf(other), key))) return true;
  for (const id of ids) {
    if (rerun.filter((other) => other.toUpperCase().includes(id)).length === 1) return true;
  }
  const { prefix } = automationStudioRequestRowNaming(label, pool);
  return prefix.length >= PREFIX_MIN_WORDS && rerun.filter((other) => startsWith(wordsOf(other), prefix)).length === 1;
}

/** Core's sentence on the named rows after the rerun. */
function said(named: readonly AutomationStudioRequestRowsNamed[], kept: readonly string[], stillLeftOut: readonly string[], step: number | undefined): string {
  const total = kept.length + stillLeftOut.length;
  const conditions = [...new Set(named.filter((entry) => entry.rows.length).map((entry) =>
    `the condition "${entry.condition}" of ${entry.step !== undefined ? `step ${entry.step}` : `read ${entry.nodeId}`}`))].join(" or ");
  const rerun = step !== undefined ? `This rerun of step ${step}` : "This rerun";
  const head = `Core's check of the Flow's last test named ${total === 1 ? "1 row" : `${total} rows`} that ${conditions} alone left out (judgement.judge.checked). `;
  if (!stillLeftOut.length) {
    return `${head}${rerun} keeps ${total === 1 ? "it" : `all ${total}`}: ${kept.join("; ")}. None of the rows the check named is left out now: complete, so the Flow is tested again from its start and judged on what it does now.`;
  }
  if (!kept.length) return `${head}${rerun} still leaves out ${total === 1 ? "it" : `all ${total}`}: ${stillLeftOut.join("; ")}.`;
  return `${head}${rerun} now keeps ${kept.length} of them: ${kept.join("; ")}. It still leaves out ${stillLeftOut.length}: ${stillLeftOut.join("; ")}.`;
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((word, index) => b[index] === word);
}

function startsWith(words: readonly string[], prefix: readonly string[]): boolean {
  return words.length >= prefix.length && prefix.every((word, index) => words[index] === word);
}
