// Core's own record of a judged result, as a no is weighed against it (t607):
// the rows the result holds, each by its columns; the rows each condition of
// each read alone left out, and which of them Core settled; the count stored
// and the repeats the answer's dedupe removed; and the request's item phrase.
// Read from the summary the judges were sent, never from a model's words.
//
// **And which settled rows fail the request's own words (t629).** A settled row
// of a read that kept rows, left out by a condition that tests text the request
// says (`./request-text-test.ts`), carries those words and the value its read's
// witness found on it (`leftOutObservations`, aligned with `leftOutOnlyByThis`):
// what a no calling it missing, or giving it another value, is held to
// (`./missing-claim.ts`, `./value-claim.ts`). A row two conditions of one name
// would give different readings is given none.
//
// **And a condition that leaves out what the request excludes (t660).** The
// text test is asked per settled row, with the value Core's read found on it:
// a presence test (`sponsored is absent`) tests that witness against the
// request's exclusion words (`./request-exclusion-test.ts`), so a row showing a
// value the request says to leave out is accounted by the request's words.
//
// **Never a condition that tests a row's own label (t651).** Where the value a
// condition tests is the row's own name (`./label-tested-condition.ts`), a row
// failing it says only that its name does not say the condition's text --
// never that the request does not ask for it, though that text is a word of
// the request. Core measured the name, not what the request's word is about,
// so none of its rows is quoted: Core neither refutes a no with them nor
// accounts for them (`./record-conditions.ts`), and a yes still quotes for
// them as for any row Core did not settle on the request's words. Each of its
// left-out rows says so (`testsLabel`): a no calling one missing disputes that
// condition, whatever its words (`./missing-claim.ts`, t651 round 2).
//
// **And every condition, and the values Core read (t631).** Each condition of
// the result, with how Core accounts for each row it alone left out
// (`./record-conditions.ts`): what a no's advice to change one is weighed
// against (`./advice-condition.ts`). And whether a text is a value Core read on
// a row -- a stored row's cell but its label, the tested value said after a
// left-out row's label, a witness's value -- and no row's label: a judge quoting
// such a value ("... whose value was "<value>"") names no row Core has no
// record of (`./named-rows.ts`).
//
// **And which rows each read saw (t654).** A8 frozen pair 5 project
// `run-mva6mlm4-97fe42f9` step 0046: a judge said a name condition "missed" a
// row that a site filter had removed before the read, so no condition ever saw
// it. A read's labels are every row it saw only where its own counts say so
// (`seenWhole`): it counted the rows it looked at, those are the rows it kept
// and the rows each condition alone left out, every condition sent each such
// row by a label that may be said, the read did not answer unfiltered, and the
// result's stored rows were sent whole and none was cut. A row two conditions
// both rejected is in no label list, so a read whose counts do not add up says
// nothing of what it did not see. Each read carries the steps that acted on
// the page before it (`narrowedBefore`, t482). None for a build test's replayed
// reads, which carry no counts (`./unseen-row-claim.ts`).
//
// **And the rows its conditions left out together (t655).** Every judged trial
// of that run fell short by such rows (seen 23, kept 9, 12 alone). A read that
// names them (`leftOutTogether`) counts them too: it is whole where `itemsSeen`
// is what it kept, each condition's alone rows and these, every one said by a
// label that may be said; their labels are rows it saw. The same listing,
// where it is complete, says which sets of conditions left rows out together
// (`together`): what a no's advice to remove several conditions brings back
// (`./advice-condition.ts`).
//
// **And every step that acted on the page before a read (t659).** A8 frozen
// pair 6 candidate towels `run-mvac1av6-f7b0f9e2`: two nos blamed a step after
// which the page stated as many results as before it, and nothing weighed them
// against that count. Each read's `narrowedBefore` steps, once each, with the
// reads they came before (`narrowing`): what `./unseen-row-claim.ts` and
// `./advice-condition.ts` hold such a no to. Not a subflow trial's entry's reads.
//
// **And the rows left out together tell labels apart (t665).** A8 frozen pair 8
// candidate towels `run-mvam0lys-2d3eb090` step 0058: a quote of a row two
// conditions left out together, "<Brand> Line Paper Towel Holder ...", named the
// stored "<Brand> Line Paper Towels Value Pack ..." because the pools a label's
// naming prefix is told apart in held no together row, so the prefix was short.
// Each read's together rows join its pool and the stored pool; those not already
// in a pool are `unnamed`: they lengthen other labels' prefixes, and are named by
// none of their own (`./named-rows.ts`).
//
// **And what a build's test would store (t771).** A test stores no record set,
// so its record held no stored row: a no naming a kept row of the test could
// never be found, and a row the test read was "found" missing though its
// answer held it. Each label of the test's answer (`buildTest.stores`) is a
// stored row, by its label alone, as its judge was sent it.
//
// **Never working rows (t752).** A breadth rerun's Flow read a list with no
// condition, repeated a display-only press over its rows, then read the same
// list again with a condition and stored exactly the rows asked for. Every read
// collects its rows into a record set, so the first read's whole list stood
// beside the answer, and this record took every row of it for a row of the
// result: a no's claim was weighed as though the answer held rows it never
// held. A record set Core flags as working rows
// (`../read-account/working-sets.ts`) is left out of the stored rows, the
// count stored and the repeats removed; its rows that the answer's condition
// alone left out are left-out rows like any other.
//
// **And what a trial changed (t775).** A build's trial is judged by the change
// Core read at each place a lasting step's change shows, just before the trial
// and just after it (`summary.siteChange`). The record carries it, so a no
// calling the total a place holds after the trial the wrong count, where the
// place changed by exactly what its part asks, is weighed against that change
// (`../site-change/count-claim.ts`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultConditionName, automationStudioResultReadWorkingSets } from "../read-account/index.ts";
import {
  automationStudioRequestPhrases,
  automationStudioRequestRowLabel,
  automationStudioRequestRowsReads,
  type AutomationStudioRequestPhrases,
  type AutomationStudioRequestWording
} from "../request-rows/index.ts";
import { automationStudioResultConditionTestsLabel } from "./label-tested-condition.ts";
import { automationStudioResultNoConditions } from "./record-conditions.ts";
import { automationStudioResultRequestTextTest } from "./request-text-test.ts";
import type {
  AutomationStudioResultNoClaim,
  AutomationStudioResultNoLeftOutRow,
  AutomationStudioResultNoNarrowingStep,
  AutomationStudioResultNoRecord,
  AutomationStudioResultNoSeenRead,
  AutomationStudioResultNoStoredRow
} from "./types.ts";

/** The record a no is weighed against (header). `requestText` gives the item phrase, `wording` the request's own words; `other` checks the claims the agreement checks itself. */
export function automationStudioResultNoRecord(input: {
  summary: AutomationStudioRunResultSummary;
  requestText?: string | undefined;
  wording?: AutomationStudioRequestWording | undefined;
  other?: ((sentence: string) => AutomationStudioResultNoClaim | undefined) | undefined;
}): AutomationStudioResultNoRecord {
  const { summary } = input;
  const { reads } = automationStudioRequestRowsReads(summary);
  // The answer's record sets: never one of working rows (header, t752).
  const working = automationStudioResultReadWorkingSets(summary);
  const answer = summary.recordSets.filter((set) => !working.has(set.datasetId));
  // And what a build's test would store, which stores no record set itself (header, t771).
  const stored = [...answer.flatMap((set) => (set.sampleRows ?? []).flatMap((row) => storedRow(row, set.columns))), ...testAnswerRows(summary)];
  const testsLabel = labelTested(summary, stored);
  const quotes = requestQuotes(summary, testsLabel, input.requestText, input.wording?.says);
  const leftOut = reads.flatMap((read) => read.conditions.flatMap((condition) => condition.rows.map((given, index) => {
    const label = condition.labels[index]!;
    const settled = condition.settled?.labels.includes(label) === true;
    const quoted = settled ? quotes.get(quoteKey(condition.condition, label)) ?? undefined : undefined;
    return { label, given, condition: condition.condition, settled, quotesRequest: quoted !== undefined, ...(quoted ? { quoted } : {}), ...(testsLabel.has(condition.condition) ? { testsLabel: true as const } : {}) };
  })));
  const storedLabels = [...new Set(stored.map((row) => row.label))];
  const named = [...reads.map((read) => [...new Set([...read.labels, ...storedLabels])]), storedLabels];
  // The rows left out together join the pools, to tell labels apart only (header, t665).
  const together = togetherLabels(summary);
  const known = new Set(named.flat());
  const unnamed = [...new Set(together.filter((label) => !known.has(label)))];
  const pools = unnamed.length ? named.map((pool) => [...pool, ...unnamed]) : named;
  const seen = seenReads(summary);
  const togetherBy = togetherSets(summary);
  const narrowing = narrowingSteps(summary);
  const tested = summary.buildTest?.stores;
  const phrases = input.requestText?.trim() ? automationStudioRequestPhrases(input.requestText) : undefined;
  return {
    stored,
    leftOut,
    pools,
    storedCount: tested ? tested.reduce((total, store) => total + store.answer.rows, 0) : working.size ? answer.reduce((total, set) => total + set.recordCount, 0) : summary.totalRecordCount,
    duplicatesRemoved: answer.reduce((total, set) => total + (set.processing?.duplicates ?? 0), 0),
    duplicatesCounted: answer.length > 0 && answer.every((set) => set.processing !== undefined)
      && !(tested ?? []).some((store) => (store.removed?.duplicates ?? 0) > 0),
    nodeIds: summary.flowShape.map((step) => step.nodeId),
    conditions: automationStudioResultNoConditions(summary, leftOut, new Set(storedLabels)),
    isValue: valuesOf(summary, stored, leftOut),
    ...(unnamed.length ? { unnamed } : {}),
    ...(seen ? { seen, seenLabels: [...new Set([...pools.flat(), ...together])] } : {}),
    ...(togetherBy.length ? { together: togetherBy } : {}),
    ...(narrowing ? { narrowing } : {}),
    ...(phrases ? { phrases, item: itemOf(storedLabels, phrases) } : {}),
    ...(input.wording ? { says: input.wording.says } : {}),
    // A trial's change, what a no's count of a change part is held to (header, t775).
    ...(summary.siteChange ? { siteChange: summary.siteChange } : {}),
    ...(input.other ? { other: input.other } : {})
  };
}

/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** One condition's counts, as a read account or a saved answer carries them. */
type Counted = { rejected?: number | undefined; alone?: number | undefined; leftOutOnlyByThis?: string[] | undefined };

/**
 * Each read, whether its labels are every row it saw, and the steps before it
 * (header, t654). Undefined where a build test's replayed reads stand beside
 * them: those carry no counts, so Core cannot say it of every read.
 */
function seenReads(summary: AutomationStudioRunResultSummary): AutomationStudioResultNoSeenRead[] | undefined {
  if ((summary.buildTest?.steps ?? []).some((step) => isObject(step.observed) && step.observed.readRows !== undefined)) return undefined;
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  const sets = summary.recordSets.filter((set) => {
    const passes = set.processing?.passes ?? [];
    return !(entry.size > 0 && passes.length > 0 && passes.every((pass) => entry.has(pass.node)));
  });
  const setsWhole = sets.every((set) => {
    if ((set.sampleRows?.length ?? 0) !== set.recordCount) return false;
    const processing = set.processing;
    if (!processing) return true;
    if ((processing.cut ?? 0) > 0) return false;
    const conditions = processing.conditions ?? [];
    return conditions.every(namesEveryRow) && conditions.reduce((total, condition) => total + condition.alone, 0) === (processing.filteredOut ?? 0);
  });
  return (summary.reads ?? []).filter((account) => !entry.has(account.nodeId)).map((account) => {
    const conditions = account.conditions ?? [];
    const whole = setsWhole && conditions.every(namesEveryRow) && togetherComplete(account);
    return { nodeId: account.nodeId, whole, narrowedBefore: account.narrowedBefore ?? [] };
  });
}

/**
 * Whether a read's own counts say its rows left out by two or more conditions
 * together are every one it names (header, t655): it counted the rows it
 * looked at, did not answer unfiltered, each condition counted its alone rows,
 * and what it looked at is what it kept, those and these, each said by a label
 * that may be said.
 */
function togetherComplete(account: AutomationStudioResultReadAccount): boolean {
  const conditions = account.conditions ?? [];
  if (account.itemsSeen === undefined || account.unfiltered === true || conditions.some((condition) => condition.alone === undefined)) return false;
  const alone = conditions.reduce((total, condition) => total + (condition.alone ?? 0), 0);
  const rows = (account.leftOutTogether ?? []).flatMap((set) => set.rows);
  return rows.every((row) => automationStudioRequestRowLabel(row) !== WITHHELD_LABEL) && account.itemsSeen === account.kept + alone + rows.length;
}

/** Every label a read's conditions left out together (header, t655): rows it saw. Not a subflow trial's entry's. */
function togetherLabels(summary: AutomationStudioRunResultSummary): string[] {
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  return (summary.reads ?? []).filter((account) => !entry.has(account.nodeId))
    .flatMap((account) => (account.leftOutTogether ?? []).flatMap((set) => set.rows.map(automationStudioRequestRowLabel)));
}

/**
 * For each read whose listing of rows left out together is complete (header),
 * the sets of conditions, by number, that left a row out together; one entry
 * per read, none for a node two accounts share or a subflow trial's entry.
 */
function togetherSets(summary: AutomationStudioRunResultSummary): NonNullable<AutomationStudioResultNoRecord["together"]> {
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  const reads = (summary.reads ?? []).filter((account) => !entry.has(account.nodeId));
  return reads.filter((account) => reads.filter((other) => other.nodeId === account.nodeId).length === 1 && togetherComplete(account))
    .map((account) => ({ nodeId: account.nodeId, sets: (account.leftOutTogether ?? []).map((set) => [...set.conditions]) }));
}

/** Every step that acted on the page before a read, once each, and those reads (header, t659); none where no read names one. Not a subflow trial's entry's. */
function narrowingSteps(summary: AutomationStudioRunResultSummary): NonNullable<AutomationStudioResultNoRecord["narrowing"]> | undefined {
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  const reads = (summary.reads ?? []).filter((account) => !entry.has(account.nodeId) && (account.narrowedBefore?.length ?? 0) > 0);
  if (!reads.length) return undefined;
  const steps = new Map<string, AutomationStudioResultNoNarrowingStep>();
  for (const account of reads) for (const step of account.narrowedBefore ?? []) if (!steps.has(step.nodeId)) steps.set(step.nodeId, step);
  return { steps: [...steps.values()], readNodeIds: [...new Set(reads.map((account) => account.nodeId))] };
}

/** Whether a condition counted the rows it alone left out and sent each by a label that may be said. */
function namesEveryRow(condition: Counted): boolean {
  const rows = condition.leftOutOnlyByThis ?? [];
  return condition.alone !== undefined && rows.length === condition.alone && rows.every((row) => automationStudioRequestRowLabel(row) !== WITHHELD_LABEL);
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Quoted = NonNullable<AutomationStudioResultNoLeftOutRow["quoted"]>;

/** A left-out row's key: its condition as named, and its label. */
function quoteKey(condition: string, label: string): string {
  return `${condition}\u0000${label}`;
}

/**
 * Each settled row of a read that kept rows whose condition tests the
 * request's own words, by condition and label: those words, and the value the
 * row's witness found (header). `null` where one key would read two ways.
 * None of a condition that tests a row's own label (header, t651).
 */
function requestQuotes(summary: AutomationStudioRunResultSummary, testsLabel: ReadonlySet<string>, requestText: string | undefined, says: ((text: string) => boolean) | undefined): Map<string, Quoted | null> {
  const quotes = new Map<string, Quoted | null>();
  if (!requestText || !says) return quotes;
  // A subflow trial's entry is judged in its own trial, as `../request-rows/summary-reads.ts` leaves it out.
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  for (const account of summary.reads ?? []) {
    // A read that kept no row shows no value passing its conditions: what it tests may not be what the request means.
    if (entry.has(account.nodeId) || !(account.kept > 0)) continue;
    (account.conditions ?? []).forEach((condition, index) => {
      if (!condition.leftOutSettled?.length || !condition.leftOutOnlyByThis?.length) return;
      const name = automationStudioResultConditionName(condition.number ?? index + 1, condition.condition);
      if (testsLabel.has(name)) return;
      const settled = new Set(condition.leftOutSettled);
      condition.leftOutOnlyByThis.forEach((row, at) => {
        const witness = condition.leftOutObservations?.[at];
        if (!settled.has(row) || witness?.state !== "present") return;
        // Per row: a presence test's text is the value Core read on that row (header, t660).
        const texts = automationStudioResultRequestTextTest(condition.condition, requestText, says, witness.value);
        if (!texts) return;
        const key = quoteKey(name, automationStudioRequestRowLabel(row));
        const known = quotes.get(key);
        quotes.set(key, known === undefined || known?.read === witness.value ? { texts, read: witness.value } : null);
      });
    });
  }
  return quotes;
}

/**
 * Each read condition that tests a row's own label (`./label-tested-condition.ts`,
 * header), as every line names it. Not a saved answer's: Core settles none of
 * its rows, so none is refuted on them.
 */
function labelTested(summary: AutomationStudioRunResultSummary, stored: readonly AutomationStudioResultNoStoredRow[]): Set<string> {
  const names = new Set<string>();
  for (const account of summary.reads ?? []) {
    (account.conditions ?? []).forEach((condition, index) => {
      if (automationStudioResultConditionTestsLabel(condition, stored)) names.add(automationStudioResultConditionName(condition.number ?? index + 1, condition.condition));
    });
  }
  return names;
}

/** A tested value said after a left-out row's label (`../read-account/alone-rows.ts`). */
const SAID_VALUE = / — [\p{L}\p{N}_.$@-]{1,64}: (.+)$/su;

/** Whether a text is a value Core read on a row and no row's label (header), compared folded. */
function valuesOf(summary: AutomationStudioRunResultSummary, stored: readonly AutomationStudioResultNoStoredRow[], leftOut: readonly AutomationStudioResultNoLeftOutRow[]): (text: string) => boolean {
  const labels = new Set([...stored.map((row) => fold(row.label)), ...leftOut.map((row) => fold(row.label))]);
  const values = new Set<string>();
  for (const row of stored) for (const cell of Object.values(row.cells)) if (cell !== row.label) values.add(fold(cell));
  for (const row of leftOut) {
    const said = SAID_VALUE.exec(row.given)?.[1];
    if (said) values.add(fold(said));
  }
  for (const account of summary.reads ?? []) {
    for (const condition of account.conditions ?? []) {
      for (const witness of condition.leftOutObservations ?? []) if (witness?.state === "present") values.add(fold(witness.value));
    }
  }
  return (text) => {
    const folded = fold(text);
    return folded.length > 0 && values.has(folded) && !labels.has(folded);
  };
}

/** A text as values are compared: lower case, each run of spaces one, no closing stop or comma. */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}

/**
 * The rows a build's test would store (header, t771): each label of each
 * dataset's answer (`buildTest.stores`, `../build-test/stores.ts`), by its
 * label alone -- a test's judge is sent no row's values -- never a withheld one.
 */
function testAnswerRows(summary: AutomationStudioRunResultSummary): AutomationStudioResultNoStoredRow[] {
  return (summary.buildTest?.stores ?? []).flatMap((store) => store.answer.labels.filter((label) => label.trim() && label !== WITHHELD_LABEL).map((label) => ({ label, cells: {} })));
}

/** A stored row by its text cells, labelled by its first text column, as `../request-rows/summary-reads.ts` labels it. */
function storedRow(row: JsonObject, columns: readonly string[]): AutomationStudioResultNoStoredRow[] {
  const cells: Record<string, string> = {};
  for (const [column, value] of Object.entries(row)) if (typeof value === "string" && value.trim()) cells[column] = value;
  const column = columns.find((id) => cells[id] !== undefined) ?? Object.keys(cells)[0];
  return column === undefined ? [] : [{ label: cells[column]!, cells }];
}

/**
 * The phrase every stored row names first, where it is a phrase of the
 * request: what `../request-rows/left-out-naming-the-item.ts` calls the item.
 * None when a row names no phrase, or they do not agree.
 */
function itemOf(labels: readonly string[], phrases: AutomationStudioRequestPhrases): string[] | undefined {
  let common: string[] | undefined;
  for (const label of labels) {
    const first = phrases.phrasesOf(label)[0];
    if (!first) return undefined;
    common = common === undefined ? first.words : commonStart(common, first.words);
    if (common.length < 2) return undefined;
  }
  return common && phrases.isPhrase(common) ? common : undefined;
}

function commonStart(left: readonly string[], right: readonly string[]): string[] {
  const shared: string[] = [];
  for (let index = 0; index < Math.min(left.length, right.length) && left[index] === right[index]; index += 1) shared.push(left[index]!);
  return shared;
}
