// The record outputs a step was authored with: each `datasetId` it writes and
// the `process` declaration beside it (t511). A step's parameters put the record
// output under a key the domain names, so it is found by what it holds -- a
// string `datasetId` -- a few objects down, never by its key.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** How many objects down a record output is looked for. */
const DEPTH = 4;

/** One record output a step declares: the dataset it writes, and its `process` when it has one. */
export type AutomationStudioResultRecordOutput = { datasetId: string; process?: JsonObject };

/** Every record output in `parameters`, outermost first. */
export function automationStudioResultRecordOutputs(parameters: JsonObject | undefined): AutomationStudioResultRecordOutput[] {
  const found: AutomationStudioResultRecordOutput[] = [];
  const visit = (value: JsonValue | undefined, depth: number): void => {
    if (depth > DEPTH || !isRecord(value)) return;
    if (typeof value.datasetId === "string") found.push({ datasetId: value.datasetId, ...(isRecord(value.process) ? { process: value.process } : {}) });
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  visit(parameters, 0);
  return found;
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
