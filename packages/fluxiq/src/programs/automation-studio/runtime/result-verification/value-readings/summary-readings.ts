// A run summary's reads and record sets with Core's readings of their values
// (t511): each read condition's and saved-answer condition's `valuesRead`
// (`./condition-readings.ts`), each record set's `sortRead`
// (`./sort-reading.ts`), and the rows a read's numeric bound or presence test
// left out that Core settles itself, `leftOutSettled` and `settled`
// (`./settled-rows.ts`, t574, t599: a presence test by each row's witness).
//
// **Where the rows come from.** Only from what the summary already carries,
// screened: a read's kept rows are the stored rows of the record sets its step
// writes (its own record output's dataset, or a set whose passes name its node),
// in the condition's tested column; its left-out rows are the condition's own
// `leftOutOnlyByThis`, said `label — column: value`. A saved answer's condition
// is read on the answer's rows. A summary made with no denied-keys declaration
// holds neither, so nothing is said.
//
// **What a condition is.** The step's authored condition, read with Core's own
// condition grammar (`parseAutomationStudioRecordCondition`) on the column the
// read account already names (`../read-account/condition.ts`); a condition in a
// spelling only the domain reads is not said.
//
// **A sort key the answer's columns leave out (t515).** Its column is in no
// stored row, so `./sort-reading.ts` has nothing to read. Core recorded the
// sort's reading of it before the columns were applied
// (`processAutomationStudioRecordRows`, `hiddenSortKeys`), and that record is
// said in its place, on the same terms: only where the summary carries rows,
// never the page's text, and the column is never added to the answer. The
// record itself is Core's bookkeeping and is taken off `processing` always, so
// no judge is shown it raw.

import {
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  type AutomationStudioRecordProcessingHiddenSortKey,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES,
  parseAutomationStudioRecordCondition,
  type AutomationStudioRecordCondition,
  type AutomationStudioRecordSortKey
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary } from "../contracts.ts";
import type { AutomationStudioResultSortRead } from "../record-set-summary.ts";
import { automationStudioResultReadConditionColumn, automationStudioResultReadParameters } from "../read-account/index.ts";
import { automationStudioResultConditionReadings, type AutomationStudioResultReadCell } from "./condition-readings.ts";
import { automationStudioResultRecordOutputs } from "./record-outputs.ts";
import { automationStudioResultSettledRows } from "./settled-rows.ts";
import { automationStudioResultSortReadings } from "./sort-reading.ts";

/** What a screened cell reads as in a summary row (`../result-summary.ts`). */
const WITHHELD_VALUE = "[withheld]";
/** A left-out row said with its tested value (`../read-account/alone-rows.ts`). */
const ROW_VALUE = /^(.+?) — ([\p{L}\p{N}_.$@-]{1,64}): (.*)$/su;
/** What an empty or screened tested value reads as. */
const NOT_A_VALUE: ReadonlySet<string> = new Set(["(no value)", "(withheld)"]);
/** The keys that name what a read's condition tests, which Core's grammar names by `field`. */
const NAMING_KEYS: ReadonlySet<string> = new Set(["field", "read"]);
/** The name a condition whose read no column makes is read under in Core's grammar, which wants a field; never said. */
const UNNAMED_COLUMN = "value";
const DAY_MS = 86_400_000;
const HIDDEN_ORDER_WORDS: Record<AutomationStudioRecordProcessingHiddenSortKey["kind"], Record<AutomationStudioRecordSortKey["order"], string>> = {
  date: { desc: "newest first", asc: "oldest first" },
  number: { desc: "highest first", asc: "lowest first" },
  text: { desc: "Z to A", asc: "A to Z" }
};
const HIDDEN_KIND_WORDS: Record<AutomationStudioRecordProcessingHiddenSortKey["kind"], string> = { date: "a date", number: "a number", text: "text" };

/** The reads and record sets, copied where a reading is said; each unchanged where none is. `now` anchors relative dates. */
export function automationStudioResultValueReadings(input: {
  reads: readonly AutomationStudioResultReadAccount[];
  /**
   * The node each read was told by, aligned with `reads` (`../read-account/accounts.ts`, t574).
   * Given, a read is read by its own node, or by none; absent, by the node of its id and definition in `flowNodes`.
   */
  authoredNodes?: ReadonlyArray<AutomationStudioFlowNode | undefined> | undefined;
  recordSets: readonly AutomationStudioResultRecordSetSummary[];
  flowNodes: readonly AutomationStudioFlowNode[];
  now: number;
}): { reads: AutomationStudioResultReadAccount[]; recordSets: AutomationStudioResultRecordSetSummary[] } {
  // A saved answer's processing is declared on the node that writes it, which for a called part is a node of its own graph.
  const declaring = [...input.flowNodes, ...(input.authoredNodes ?? []).filter((node): node is AutomationStudioFlowNode => node !== undefined && !input.flowNodes.includes(node))];
  const recordSets = input.recordSets.map((set) => withAnswerReadings(set, declaring, input.now));
  const reads = input.reads.map((read, index) => {
    const node = input.authoredNodes ? input.authoredNodes[index] : input.flowNodes.find((candidate) => candidate.id === read.nodeId && candidate.definitionId === read.definitionId);
    return withReadReadings(read, input.recordSets, node?.definitionId === read.definitionId ? node : undefined);
  });
  return { reads, recordSets };
}

function withReadReadings(read: AutomationStudioResultReadAccount, sets: readonly AutomationStudioResultRecordSetSummary[], node: AutomationStudioFlowNode | undefined): AutomationStudioResultReadAccount {
  const authored = automationStudioResultReadParameters(node?.parameterValues);
  if (!node || !authored || !read.conditions?.length) return read;
  const written = Array.isArray(authored.where) ? authored.where : [];
  const columns = isRecord(authored.fields) ? authored.fields : undefined;
  const datasets = new Set(automationStudioResultRecordOutputs(node.parameterValues).map((output) => output.datasetId));
  const writes = sets.filter((set) => datasets.has(set.datasetId) || set.processing?.passes.some((pass) => pass.node === read.nodeId) === true);
  let changed = false;
  const conditions = read.conditions.map((entry, index) => {
    const column = automationStudioResultReadConditionColumn(written[index], columns);
    // A condition whose read no column makes is read in Core's grammar under a stand-in name: only a presence test's witnesses can settle its rows (`./settled-rows.ts`, t599).
    const condition = asRecordCondition(written[index], column ?? UNNAMED_COLUMN);
    if (!condition) return entry;
    const kept = read.unfiltered || column === undefined ? [] : writes.flatMap((set) => keptCells(set, column));
    // Each row's witness, where the read sent one for every row (`../read-account/accounts.ts`).
    const witnesses = entry.leftOutObservations?.length === entry.leftOutOnlyByThis?.length ? entry.leftOutObservations : undefined;
    const paired = (entry.leftOutOnlyByThis ?? []).map((row, at) => ({ row, cell: column === undefined ? undefined : leftOutCell(row, column), witness: witnesses?.[at] }));
    const leftOut = paired.flatMap(({ cell }) => cell ?? []);
    const valuesRead = column === undefined ? [] : automationStudioResultConditionReadings({ condition, column, kept, leftOut });
    // The rows a numeric bound or a presence test left out that Core read as failing it: settled, never quoted for row by row (`./settled-rows.ts`, t574, t599).
    const settled = read.unfiltered ? undefined : automationStudioResultSettledRows({ condition, column, number: entry.number ?? index + 1, wording: entry.condition, leftOut: paired });
    if (!valuesRead.length && !settled) return entry;
    changed = true;
    return { ...entry, ...(valuesRead.length ? { valuesRead } : {}), ...(settled ?? {}) };
  });
  return changed ? { ...read, conditions } : read;
}

function withAnswerReadings(summarized: AutomationStudioResultRecordSetSummary, nodes: readonly AutomationStudioFlowNode[], now: number): AutomationStudioResultRecordSetSummary {
  const { set, hidden } = withoutHiddenSortKeys(summarized);
  const process = nodes.flatMap((node) => automationStudioResultRecordOutputs(node.parameterValues)).find((output) => output.datasetId === set.datasetId && output.process)?.process;
  const rows = set.sampleRows ?? [];
  if (!rows.length || (!process && !hidden.length)) return set;
  const keys = process ? sortKeys(process.sort) : [];
  const stored = automationStudioResultSortReadings(keys, rows, now);
  const sortRead = [
    ...stored.map((read) => ({ read, position: keys.findIndex((key) => key.field === read.field) })),
    ...hidden.filter((key) => !stored.some((read) => read.field === key.field)).map((key) => ({ read: hiddenSortRead(key, set.processing?.kept ?? rows.length), position: key.position }))
  ].sort((one, other) => one.position - other.position).map((entry) => entry.read);
  const where = process && Array.isArray(process.where) ? process.where : [];
  let conditionsChanged = false;
  const conditions = set.processing?.conditions?.map((entry, index) => {
    const authored = where[index];
    const column = isRecord(authored) && typeof authored.field === "string" ? authored.field : undefined;
    const condition = column === undefined ? undefined : asRecordCondition(authored, column);
    if (!condition || column === undefined) return entry;
    const valuesRead = automationStudioResultConditionReadings({ condition, column, kept: keptCells(set, column), leftOut: [] });
    if (!valuesRead.length) return entry;
    conditionsChanged = true;
    return { ...entry, valuesRead };
  });
  if (!sortRead.length && !conditionsChanged) return set;
  return {
    ...set,
    ...(conditionsChanged && set.processing && conditions ? { processing: { ...set.processing, conditions } } : {}),
    ...(sortRead.length ? { sortRead } : {})
  };
}

/** The set with Core's record of its hidden sort keys taken off its processing account (header), and that record. */
function withoutHiddenSortKeys(set: AutomationStudioResultRecordSetSummary): { set: AutomationStudioResultRecordSetSummary; hidden: AutomationStudioRecordProcessingHiddenSortKey[] } {
  if (!set.processing || !Object.hasOwn(set.processing, "hiddenSortKeys")) return { set, hidden: [] };
  const { hiddenSortKeys, ...processing } = set.processing;
  return { set: { ...set, processing }, hidden: Array.isArray(hiddenSortKeys) ? hiddenSortKeys : [] };
}

/** A hidden sort key said as `./sort-reading.ts` says a stored one, on the answer's `kept` rows, with no cell text. */
function hiddenSortRead(key: AutomationStudioRecordProcessingHiddenSortKey, kept: number): AutomationStudioResultSortRead {
  const first = key.position === 0;
  const lead = `${first ? "Core sorts this answer by" : "Then, among rows the keys before tie, by"} ${key.field}, ${HIDDEN_ORDER_WORDS[key.kind][key.order]}, reading ${key.field} as ${HIDDEN_KIND_WORDS[key.kind]}: ${key.read} of ${kept} rows state one`;
  const rest = key.read < kept ? `; the other ${kept - key.read} state none and come last` : "";
  const hiddenWords = ` ${key.field} is not one of the answer's columns: Core read it on the stored rows before leaving it out`;
  const order = key.inOrder === undefined ? "." : key.inOrder ? ", and the answer's rows were in that order." : ", and the answer's rows were not in that order.";
  const readings = key.readings?.length ? ` Read, in row order: ${hiddenReadingsOf(key.readings, key.kind, kept)}.` : "";
  return { field: key.field, ...(key.inOrder !== undefined ? { inOrder: key.inOrder } : {}), said: `${lead}${rest}.${hiddenWords}${order}${readings}` };
}

/** The recorded readings in row order: a date as its day (with the time where two share one), a number as itself. */
function hiddenReadingsOf(readings: readonly (number | null)[], kind: AutomationStudioRecordProcessingHiddenSortKey["kind"], kept: number): string {
  const instants = readings.filter((value): value is number => typeof value === "number");
  const withTime = kind === "date" && instants.some((one, index) => instants.some((other, at) => at !== index && one !== other && Math.floor(one / DAY_MS) === Math.floor(other / DAY_MS)));
  const shown = readings.map((value) => (value === null ? `no ${kind}` : kind === "date" ? dayText(value, withTime) : String(value)));
  const more = kept - shown.length;
  return `${shown.join("; ")}${more > 0 ? `; and ${more} more ${more === 1 ? "row" : "rows"}` : ""}`;
}

function dayText(instant: number, withTime: boolean): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "no date";
  const iso = date.toISOString();
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
}

/** An authored condition in Core's grammar, testing `column`; `undefined` for one Core's grammar does not read. */
function asRecordCondition(written: JsonValue | undefined, column: string): AutomationStudioRecordCondition | undefined {
  if (!isRecord(written)) return undefined;
  const rest = Object.fromEntries(Object.entries(written).filter(([key]) => !NAMING_KEYS.has(key)));
  return parseAutomationStudioRecordCondition({ ...rest, field: column }) ?? undefined;
}

/** A set's rows that hold `column`, each by its label -- its first column holding text -- and that cell. */
function keptCells(set: AutomationStudioResultRecordSetSummary, column: string): AutomationStudioResultReadCell[] {
  return (set.sampleRows ?? []).flatMap((row) => {
    const value = row[column];
    if (typeof value !== "string" || !value.trim() || value === WITHHELD_VALUE) return [];
    const labelColumn = set.columns.find((id) => typeof row[id] === "string" && (row[id] as string).trim().length > 0 && row[id] !== WITHHELD_VALUE);
    return [{ label: labelColumn === undefined ? value : (row[labelColumn] as string), value }];
  });
}

/** A left-out row said `label — column: value` for `column`, as a cell; none otherwise. */
function leftOutCell(row: string, column: string): AutomationStudioResultReadCell | undefined {
  const found = ROW_VALUE.exec(row);
  if (!found || found[2] !== column || NOT_A_VALUE.has(found[3]!.trim())) return undefined;
  return { label: found[1]!, value: found[3]! };
}

/** The sort keys a `process.sort` states in Core's grammar, in order; a key it does not read is left out. */
function sortKeys(sort: JsonValue | undefined): AutomationStudioRecordSortKey[] {
  if (!Array.isArray(sort)) return [];
  return sort.flatMap((key): AutomationStudioRecordSortKey[] => {
    if (!isRecord(key) || typeof key.field !== "string") return [];
    const order = key.order;
    if (!(AUTOMATION_STUDIO_RECORD_SORT_ORDERS as readonly unknown[]).includes(order)) return [];
    if (key.as !== undefined && !(AUTOMATION_STUDIO_RECORD_SORT_TYPES as readonly unknown[]).includes(key.as)) return [];
    return [{ field: key.field, order: order as AutomationStudioRecordSortKey["order"], ...(key.as !== undefined ? { as: key.as as NonNullable<AutomationStudioRecordSortKey["as"]> } : {}) }];
  });
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
