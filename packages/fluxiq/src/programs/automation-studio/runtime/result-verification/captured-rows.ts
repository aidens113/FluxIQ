// A captured row, read back from the rows the run stored (t482, D3).
//
// **Why.** A run's saved trace holds a marker wherever a captured row sat
// (`../executor/record-summary.ts`: `{ $datasetRow: { datasetId, ordinal } }`),
// and a list loop hands its passes the read's rows by reference, so in the
// trace the judge's summary is built from, each pass's row is that marker.
// `./step-rows.ts` left out every `$`-prefixed key as minted per read, and lane
// D round 12 (`run-mv62icw0-070f88ad`, D3) sent `rowsActedOn` to both judges
// as four `{}`.
//
// **Only where the stored rows still stand in capture order.** The ordinal is
// the row's place among the rows the run collected, from 1. A reader is handed
// the dataset's answer once it is processed, and processing can drop repeats,
// leave rows out, cut a limit or sort. So a marker is read back only from a
// set that is unprocessed (it reads as its collected rows), or whose
// processing kept every row it collected and whose every writing step is a
// step of this Flow that declares no sort -- in the record output's `process`,
// or in the read's own parameters, the one object of them that holds what a
// read is authored with (as `./read-account/accounts.ts` finds it). Anywhere
// else a marker names no row: a wrong row is worse than none.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioResultRecordSetInput } from "./result-summary.ts";

/** The members that mark an object as a read's own parameters (`./read-account/accounts.ts`). */
const READ_PARAMETER_KEYS = ["where", "paginate", "dedupe", "fields"];

/** The stored row a captured-row marker stands for, where the stored rows say it for certain (header). */
export function automationStudioResultCapturedRows(
  recordSets: readonly AutomationStudioResultRecordSetInput[],
  flowNodes: readonly AutomationStudioFlowNode[]
): (datasetId: string, ordinal: number) => JsonObject | undefined {
  const nodes = new Map(flowNodes.map((node) => [node.id, node]));
  const inOrder = new Map<string, readonly JsonObject[]>();
  for (const set of recordSets) {
    if (!set.rows || !inCaptureOrder(set, set.rows.length, nodes)) continue;
    inOrder.set(set.summary.datasetId, set.rows);
  }
  return (datasetId, ordinal) => Number.isSafeInteger(ordinal) && ordinal >= 1 ? inOrder.get(datasetId)?.[ordinal - 1] : undefined;
}

function inCaptureOrder(set: AutomationStudioResultRecordSetInput, rows: number, nodes: ReadonlyMap<string, AutomationStudioFlowNode>): boolean {
  const processing = set.summary.processing;
  if (!processing) return true;
  if (processing.collected !== processing.kept || rows !== processing.kept) return false;
  const writers = set.summary.nodeIds.map((id) => nodes.get(id));
  return writers.length > 0 && writers.every((node) => node !== undefined && !declaresSort(node));
}

/** Whether the step declares a sort of its rows: in its record output's `process`, or among its read's parameters. */
function declaresSort(node: AutomationStudioFlowNode): boolean {
  const parameters = node.parameterValues;
  const outputs = [parameters?.recordOutput, node.metadata?.recordOutput].filter(isRecord);
  if (outputs.some((output) => isRecord(output.process) && sorts(output.process.sort))) return true;
  if (!parameters) return false;
  const candidates = [parameters, ...Object.values(parameters).filter(isRecord)];
  return candidates.some((candidate) => READ_PARAMETER_KEYS.some((key) => Object.hasOwn(candidate, key)) && sorts(candidate.sort));
}

function sorts(value: JsonValue | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== false;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
