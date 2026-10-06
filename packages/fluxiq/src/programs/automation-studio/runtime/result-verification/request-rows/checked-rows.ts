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
// **What is said, in Core's words.** A named row no condition left out alone
// that is in the result, although the judgement calls it left out: the check
// misread which rows were left out, and advice resting on that reading is not
// supported. And per condition, the named rows that condition really left out
// alone. Nothing of the judgement is copied but the labels and ids it matched.

import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioRequestRowNaming, automationStudioRequestTextNamesRow } from "./row-naming.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsRead } from "./types.ts";
import { automationStudioRequestRowIds } from "./words.ts";

/** Words that say a row was left out. */
const LEFT_OUT = /\b(left out|leaves? out|leaving out|drop(s|ped|ping)?|exclud(e|es|ed|ing)|reject(s|ed|ing)?|omit(s|ted|ting)?|missing|misses|missed|filtered out|filters out)\b/iu;
/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|approx|incl)\./giu;

/** A row the judgement named: its label, the ids it was named by, and whether a sentence naming it called it left out. */
type Named = { label: string; ids: Set<string>; calledLeftOut: boolean };

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
  for (const sentence of sentences(judgement)) {
    const leftOut = LEFT_OUT.test(sentence);
    for (const id of automationStudioRequestRowIds(sentence)) {
      const holders = new Set(stored.filter((row) => row.cells.some((cell) => cell.toUpperCase().includes(id))).map((row) => row.label));
      if (!holders.size) for (const label of everyLabel) if (label.toUpperCase().includes(id)) holders.add(label);
      // An id more than one row holds names none of them.
      if (holders.size === 1) note([...holders][0]!, id, leftOut);
    }
    for (const { label, prefix } of prefixes) {
      if (automationStudioRequestTextNamesRow(sentence, { prefix, ids: [] })) note(label, undefined, leftOut);
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
    `${entry.where}: the condition "${entry.condition}" alone left out ${entry.rows.length === 1 ? "this row" : "these rows"} the check names: ${entry.rows.join("; ")}.`);
  return [...misread, ...alone];
}

/** A row as a line names it: its label, then the ids the judgement named it by. */
function said(row: Named): string {
  return row.ids.size ? `${row.label} (${[...row.ids].join(", ")})` : row.label;
}

function whereOf(read: AutomationStudioRequestRowsRead): string {
  return read.step !== undefined ? `Step ${read.step}` : `Read ${read.nodeId}`;
}

/** The judgement's sentences and clauses: a full stop, semicolon or line ends one, an abbreviation's stop does not. */
function sentences(text: string): string[] {
  return text.replace(ABBREVIATIONS, (match) => match.replace(/\./gu, "")).split(/(?<=[.;!?])\s+|\n+/u).filter((sentence) => sentence.trim());
}
