// The rows a summary holds, read per list read: what it kept, what is in the
// result, and what each condition alone left out.
//
// Two senders, one shape. A build test's replayed read carries `readRows` in a
// step's `observed` (`../build-test/read-rows.ts`): the rows it returned, and per
// condition the rows that condition alone left out. A finished run carries its
// stored rows in its record sets' samples and, per read, each condition's
// `leftOutOnlyByThis` (`../read-account/accounts.ts`). A run's stored rows are
// not split by the read that stored them -- live run `run-muw60j7c-bb7c9a62`
// appended an unfiltered read's 20 rows beside its filtered read's 10 -- so a
// run's read is taken to have kept every stored row that no condition of its own
// left out alone.
//
// **Whether a condition tested the row's own label** (`types.ts`, `testedLabel`)
// is read differently from each. A build test's replay sends the tested cell
// after every label it did not test, an empty one as `(no value)`, so a
// condition whose rows are all said by label alone tested the label. A run's
// account says it itself (`../read-account/accounts.ts`), from the authored
// condition: a run's row said by its label alone may only be a row whose tested
// column was not stored -- live run `run-mux6naez-6c20f26e` stored name, price,
// rating and url, and its `plus is present` rows, so said, were taken as tests
// of the name.
//
// **A record set's processing conditions are its read's conditions too (t493).**
// Live run `run-mv6bg8d8-1a461436` put its name exclusion on the saved answer,
// `recordOutput.process.where`, rather than on the read, and three items sold
// with a charging case were left out where nothing here looked. Each record
// set's processing says, per `where` condition, the rows it alone left out
// (`../processing-account.ts`); those conditions join the read whose passes
// collected the set (`processing.passes[].node`), named
// `recordOutput.process.where <wording>` so every line that names the
// condition says where to change it, and with the set's own `testedLabel`.
// Where no read account names that node, the set is a read of its own, its
// stored rows kept. So the flag, the check of a yes and the check of a no read
// a processed-out row exactly as they read a row the read itself left out.
//
// **One name per condition (t574).** Every condition is named
// `condition N (wording)` (`../read-account/condition-name.ts`), N the number
// its account carries, so Core's lines, the recheck and the flag all say the
// index and wording the judge's copy says. A test's condition is named so
// where the replay numbered it, its field key standing for the wording, and
// `condition "<field>"` where it did not.
//
// **And the rows Core settled** (`../value-readings/settled-rows.ts`, t574):
// a run's condition carries their labels and the word runs that name it, for
// `unquoted-rows.ts`: `condition N`, its column, and the numbers a bound's
// wording writes -- or, for a presence test (t599) or a text test (t624), the
// one column its wording names, and no number, since neither bounds anything.
//
// **Not the reads that prepared a subflow trial's entry (t599).** A8 social
// `run-mv8ic6mk-09bf12ff`: a subflow trial runs its predecessors inside it, so
// the summary carries their reads too, and every yes over the target was held
// to quote, beside the predecessor's left-out rows, words that its judge's
// request -- the target's own parts -- does not hold. Those steps are named in
// the summary's `taskChecklist.entry` (`../build-test/task-checklist.ts`), each
// judged in its own trial, so their reads, and the record sets only they
// collected, are left out here: no check of a judgement's rows holds this
// trial to them. Only the request's search words are still read from every
// read (`request-wording.ts`, `withEntry`).
//
// **A row may say Core's short id before it** (`row-id.ts`, t599), on the
// judge's copy: a row is read as its label without it.
//
// **And which read stored a left-out row (t691).** A8 `run-mvbr0w7e-6a01c05b`:
// a read's condition left four rows out of what the Flow then acted on, and a
// later read with no condition stored all eight rows of the same list. Core told the judge the four were "another copy
// of the same item ... kept" (`summary-with-also-in-result.ts`, t624) and
// exempted them from every quote (`unquoted-rows.ts`), so a yes over an answer
// holding four rows it should not hold was taken. That note was written for a
// second copy inside one read; here a different read stored them.
//
// A record set's collectors are the read nodes its processing passes name
// (`processing.passes[].node`). A left-out row's label stored in a
// set the same read collected is that read's own copy. Where every set holding
// it names its collectors and none is that read, it is stored by another read:
// `automationStudioRequestRowsStoredBy` returns those reads. A set that names
// no collector could be any read's, so a label it holds is never said to be
// stored elsewhere: what Core cannot tell it does not claim. A run's read
// carries `storedElsewhere`: each label one of its conditions left out that
// another read stored and this read did not, with those reads. Its `inResult`
// still holds every stored label; `unquoted-rows.ts` reads the two together.
//
// **Not working rows (t752).** A Flow read a list with no condition, repeated
// a display-only press over its rows, then read the same list again with a
// condition and stored the answer. Every read collects its rows into a record
// set, so the first read's whole list was taken here for the result: each row
// the last read's condition left out was "stored elsewhere" by the first read,
// and the answer could not be judged yes. A record set of working rows
// (`../read-account/working-sets.ts`, from Core's flag on the read whose rows a loop walked
// before a later read of the same list) is left out here as the entry's sets
// are: its rows are not stored, not `inResult`, never a holder that
// `automationStudioRequestRowsStoredBy` names, and its processing conditions
// are not the result's. A row only it holds is a left-out row like any other.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioResultProcessingCondition } from "../processing-account.ts";
// The leaf, not the barrel: `../read-account/` reaches `../../llm/`, which reaches this directory, so a value through the barrel would close a module cycle.
import { automationStudioResultConditionName } from "../read-account/condition-name.ts";
import { automationStudioResultReadWorkingSets } from "../read-account/working-sets.ts";
import { AutomationStudioRequestRowId } from "./row-id.ts";
import type { AutomationStudioRequestRowsCondition, AutomationStudioRequestRowsRead, AutomationStudioRequestRowsStored } from "./types.ts";
import { automationStudioRequestRowWords } from "./words.ts";

/** How a processing condition is named among a read's conditions (header): where the Flow writes it. */
const PROCESSING_CONDITION = "recordOutput.process.where";

/** A left-out row said with the value its condition tested after its label (`../read-account/alone-rows.ts`). */
const TESTED_VALUE = /^(.+?) — (?:\(withheld\)|[\p{L}\p{N}_.$@-]{1,64}: .*)$/su;
/** The column a row said with its tested value names. */
const TESTED_COLUMN = /^.+? — ([\p{L}\p{N}_.$@-]{1,64}): /su;
/** A presence test's wording (`../read-account/condition.ts`): its column, what its read found where said, and `is present` or `is absent`. */
const PRESENCE_WORDING = /^([\p{L}\p{N}_.$@-]{1,64})(?: \(read .*\))? (?:not )?is (?:present|absent)$/su;
/** A text test's wording when a column names what it tests (t624). */
const TEXT_WORDING = /^([\p{L}\p{N}_.$@-]{1,64})(?: \(read .*\))? (?:not )?(?:contains|startsWith|endsWith|matches|equals) \[?"/su;

/**
 * Every list read a summary holds rows for, and a run's stored rows. The
 * reads and record sets of a subflow trial's entry are left out (header)
 * unless `withEntry` asks for them.
 */
export function automationStudioRequestRowsReads(summary: AutomationStudioRunResultSummary, withEntry = false): { reads: AutomationStudioRequestRowsRead[]; stored: AutomationStudioRequestRowsStored[] } {
  const entrySteps = new Set(withEntry ? [] : summary.taskChecklist?.entry?.steps ?? []);
  // A record set only the entry's steps collected is the entry's too.
  const entrySet = (set: AutomationStudioResultRecordSetSummary): boolean => entrySteps.size > 0 && (set.processing?.passes.length ?? 0) > 0 && set.processing!.passes.every((pass) => entrySteps.has(pass.node));
  // Working rows are never the result (header, t752).
  const working = automationStudioResultReadWorkingSets(summary);
  const recordSets = summary.recordSets.filter((set) => !entrySet(set) && !working.has(set.datasetId));
  const stored = recordSets.flatMap(automationStudioRequestRowsStoredOf);
  const reads: AutomationStudioRequestRowsRead[] = [];
  for (const step of summary.buildTest?.steps ?? []) {
    const sent = isObject(step.observed) ? step.observed.readRows : undefined;
    if (!isObject(sent)) continue;
    const rows = strings(sent.rows);
    const conditions = Array.isArray(sent.leftOutOnlyByThis)
      ? sent.leftOutOnlyByThis.flatMap((entry) => {
        if (!isObject(entry) || typeof entry.condition !== "string") return [];
        const rows = strings(entry.rows);
        const name = typeof entry.number === "number" ? automationStudioResultConditionName(entry.number, entry.condition) : `condition "${entry.condition}"`;
        return [condition(name, rows, rows.length > 0 && rows.every((row) => !TESTED_VALUE.test(row)))];
      })
      : [];
    reads.push(read({ step: step.step }, rows, rows, conditions));
  }
  const storedLabels = unique(stored.map((row) => row.label));
  for (const account of summary.reads ?? []) {
    if (entrySteps.has(account.nodeId)) continue;
    const conditions = (account.conditions ?? []).flatMap((entry, index) => {
      if (!entry.leftOutOnlyByThis?.length) return [];
      const number = entry.number ?? index + 1;
      const settled = entry.leftOutSettled?.length ? { labels: entry.leftOutSettled.map(automationStudioRequestRowLabel), names: boundNames(number, entry.leftOutSettled, entry.condition, entry.settledKind ?? "bound"), kind: entry.settledKind ?? "bound" } : undefined;
      return [condition(automationStudioResultConditionName(number, entry.condition), entry.leftOutOnlyByThis, entry.testedLabel === true, settled)];
    });
    const leftOut = new Set(conditions.flatMap((entry) => entry.labels));
    reads.push(read({ nodeId: account.nodeId }, storedLabels.filter((label) => !leftOut.has(label)), storedLabels, conditions));
  }
  for (const set of recordSets) {
    const conditions = processingConditions(set.processing?.conditions);
    if (!conditions.length) continue;
    const nodes = (set.processing?.passes ?? []).map((pass) => pass.node);
    const collecting = reads.find((candidate) => candidate.nodeId !== undefined && nodes.includes(candidate.nodeId));
    if (collecting) {
      collecting.conditions.push(...conditions);
      collecting.labels = unique([...collecting.labels, ...conditions.flatMap((entry) => entry.labels)]);
    } else {
      reads.push(read({ nodeId: nodes[0] ?? set.datasetId }, automationStudioRequestRowsStoredOf(set).map((row) => row.label), storedLabels, conditions));
    }
  }
  // The left-out rows another read stored, never this read's own copy (header, t691).
  const storedBy = automationStudioRequestRowsStoredBy({ ...summary, recordSets });
  for (const entry of reads) {
    if (entry.nodeId === undefined) continue;
    const elsewhere = unique(entry.conditions.flatMap((condition) => condition.labels)).flatMap((label) => {
      const by = storedBy(entry.nodeId!, label);
      return by ? [{ label, by }] : [];
    });
    if (elsewhere.length) entry.storedElsewhere = elsewhere;
  }
  return { reads, stored };
}

/** A record set's processing conditions that left rows out alone, each named where the Flow writes it (header). */
function processingConditions(conditions: readonly AutomationStudioResultProcessingCondition[] | undefined): AutomationStudioRequestRowsCondition[] {
  return (conditions ?? []).flatMap((entry, index) =>
    entry.leftOutOnlyByThis?.length ? [condition(`${PROCESSING_CONDITION} ${automationStudioResultConditionName(entry.number ?? index + 1, entry.condition)}`, entry.leftOutOnlyByThis, entry.testedLabel === true)] : []);
}

/** A left-out row's label: the row as given, less Core's id said before it (header) and the tested value said after it. */
export function automationStudioRequestRowLabel(row: string): string {
  const unsaid = AutomationStudioRequestRowId.unsaid(row);
  return TESTED_VALUE.exec(unsaid)?.[1] ?? unsaid;
}

function read(at: { step: number } | { nodeId: string }, kept: string[], inResult: string[], conditions: AutomationStudioRequestRowsCondition[]): AutomationStudioRequestRowsRead {
  return { ...at, kept: unique(kept), inResult: unique(inResult), conditions, labels: unique([...kept, ...inResult, ...conditions.flatMap((entry) => entry.labels)]) };
}

function condition(name: string, rows: string[], testedLabel: boolean, settled?: AutomationStudioRequestRowsCondition["settled"]): AutomationStudioRequestRowsCondition {
  return { condition: name, rows, labels: rows.map(automationStudioRequestRowLabel), testedLabel, ...(settled ? { settled } : {}) };
}

/**
 * The word runs a sentence names a settled condition by: `condition N`, its
 * column (whole, and split where it joins words in camel case), and each number
 * its wording writes -- the bound a quote of the request states. A presence
 * test's or a text test's column is read from its wording where no row says
 * it, and its wording gives no number: it bounds nothing, and a number in a
 * text test's text is part of what it looks for (header, t624).
 */
function boundNames(number: number, settledRows: readonly string[], wording: string | undefined, kind: "bound" | "presence" | "text"): string[][] {
  const names = [wordsOf(`condition ${number}`)];
  const presence = PRESENCE_WORDING.exec(wording ?? "")?.[1];
  // Whether the condition bounds a number is the kind Core settled it by, not a re-reading of its wording.
  const unbounded = kind !== "bound";
  const column = TESTED_COLUMN.exec(AutomationStudioRequestRowId.unsaid(settledRows[0] ?? ""))?.[1] ?? presence ?? TEXT_WORDING.exec(wording ?? "")?.[1];
  if (column) names.push(wordsOf(column), wordsOf(column.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")));
  if (!unbounded) for (const word of wordsOf(wording ?? "")) if (/^\p{N}+$/u.test(word)) names.push([word]);
  const said = new Set<string>();
  return names.filter((name) => {
    const key = name.join(" ");
    if (!name.length || said.has(key)) return false;
    said.add(key);
    return true;
  });
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

/**
 * A record set's sampled rows, each by its label -- its first column holding
 * text -- and every text cell.
 */
export function automationStudioRequestRowsStoredOf(set: AutomationStudioResultRecordSetSummary): AutomationStudioRequestRowsStored[] {
  return (set.sampleRows ?? []).flatMap((row: JsonObject) => {
    const cells = Object.values(row).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const column = set.columns.find((id) => typeof row[id] === "string" && (row[id] as string).trim().length > 0);
    const label = column !== undefined ? (row[column] as string) : cells[0];
    return label === undefined ? [] : [{ label, cells }];
  });
}

/**
 * For a read and a label it left out: the reads that stored that label, where
 * none of them is that read and Core knows each (header); none otherwise --
 * the label is not stored, or that read, or a read Core cannot name, stored it.
 * A record set of working rows (`../read-account/working-sets.ts`, t752) is no holder: it is
 * not the result.
 */
export function automationStudioRequestRowsStoredBy(summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">): (nodeId: string, label: string) => string[] | undefined {
  const working = automationStudioResultReadWorkingSets(summary);
  const holders = new Map<string, Array<readonly string[] | undefined>>();
  for (const set of summary.recordSets) {
    if (working.has(set.datasetId)) continue;
    const nodes = [...new Set((set.processing?.passes ?? []).map((pass) => pass.node))];
    for (const label of new Set(automationStudioRequestRowsStoredOf(set).map((row) => row.label))) {
      holders.set(label, [...(holders.get(label) ?? []), nodes.length ? nodes : undefined]);
    }
  }
  return (nodeId, label) => {
    const sets = holders.get(label);
    if (!sets || sets.some((collectors) => collectors === undefined || collectors.includes(nodeId))) return undefined;
    return [...new Set(sets.flatMap((collectors) => collectors ?? []))];
  };
}

function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
