// A run summary's reads and record sets with Core's readings of their values
// (t511): each read condition's and saved-answer condition's `valuesRead`
// (`./condition-readings.ts`) and each record set's `sortRead`
// (`./sort-reading.ts`).
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

import {
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES,
  parseAutomationStudioRecordCondition,
  type AutomationStudioRecordCondition,
  type AutomationStudioRecordSortKey
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary } from "../contracts.ts";
import { automationStudioResultReadConditionColumn, automationStudioResultReadParameters } from "../read-account/index.ts";
import { automationStudioResultConditionReadings, type AutomationStudioResultReadCell } from "./condition-readings.ts";
import { automationStudioResultRecordOutputs } from "./record-outputs.ts";
import { automationStudioResultSortReadings } from "./sort-reading.ts";

/** What a screened cell reads as in a summary row (`../result-summary.ts`). */
const WITHHELD_VALUE = "[withheld]";
/** A left-out row said with its tested value (`../read-account/alone-rows.ts`). */
const ROW_VALUE = /^(.+?) — ([\p{L}\p{N}_.$@-]{1,64}): (.*)$/su;
/** What an empty or screened tested value reads as. */
const NOT_A_VALUE: ReadonlySet<string> = new Set(["(no value)", "(withheld)"]);
/** The keys that name what a read's condition tests, which Core's grammar names by `field`. */
const NAMING_KEYS: ReadonlySet<string> = new Set(["field", "read"]);

/** The reads and record sets, copied where a reading is said; each unchanged where none is. `now` anchors relative dates. */
export function automationStudioResultValueReadings(input: {
  reads: readonly AutomationStudioResultReadAccount[];
  recordSets: readonly AutomationStudioResultRecordSetSummary[];
  flowNodes: readonly AutomationStudioFlowNode[];
  now: number;
}): { reads: AutomationStudioResultReadAccount[]; recordSets: AutomationStudioResultRecordSetSummary[] } {
  const recordSets = input.recordSets.map((set) => withAnswerReadings(set, input.flowNodes, input.now));
  const reads = input.reads.map((read) => withReadReadings(read, input.recordSets, input.flowNodes));
  return { reads, recordSets };
}

function withReadReadings(read: AutomationStudioResultReadAccount, sets: readonly AutomationStudioResultRecordSetSummary[], nodes: readonly AutomationStudioFlowNode[]): AutomationStudioResultReadAccount {
  const node = nodes.find((candidate) => candidate.id === read.nodeId && candidate.definitionId === read.definitionId);
  const authored = automationStudioResultReadParameters(node?.parameterValues);
  if (!node || !authored || !read.conditions?.length) return read;
  const written = Array.isArray(authored.where) ? authored.where : [];
  const columns = isRecord(authored.fields) ? authored.fields : undefined;
  const datasets = new Set(automationStudioResultRecordOutputs(node.parameterValues).map((output) => output.datasetId));
  const writes = sets.filter((set) => datasets.has(set.datasetId) || set.processing?.passes.some((pass) => pass.node === read.nodeId) === true);
  let changed = false;
  const conditions = read.conditions.map((entry, index) => {
    const column = automationStudioResultReadConditionColumn(written[index], columns);
    const condition = column === undefined ? undefined : asRecordCondition(written[index], column);
    if (!condition || column === undefined) return entry;
    const kept = read.unfiltered ? [] : writes.flatMap((set) => keptCells(set, column));
    const leftOut = (entry.leftOutOnlyByThis ?? []).flatMap((row) => leftOutCell(row, column) ?? []);
    const valuesRead = automationStudioResultConditionReadings({ condition, column, kept, leftOut });
    if (!valuesRead.length) return entry;
    changed = true;
    return { ...entry, valuesRead };
  });
  return changed ? { ...read, conditions } : read;
}

function withAnswerReadings(set: AutomationStudioResultRecordSetSummary, nodes: readonly AutomationStudioFlowNode[], now: number): AutomationStudioResultRecordSetSummary {
  const process = nodes.flatMap((node) => automationStudioResultRecordOutputs(node.parameterValues)).find((output) => output.datasetId === set.datasetId && output.process)?.process;
  const rows = set.sampleRows ?? [];
  if (!process || !rows.length) return set;
  const sortRead = automationStudioResultSortReadings(sortKeys(process.sort), rows, now);
  const where = Array.isArray(process.where) ? process.where : [];
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
