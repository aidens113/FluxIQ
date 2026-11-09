import type { DataStep } from "@fluxiq/contracts/fluxnode";
import { evaluateExpression, isTruthy } from "../expression/index.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";

/** Keeps the records for which `where` is true. Records pass unchanged, lineage included. */
export function filterStep(step: Extract<DataStep, { kind: "filter" }>, records: readonly PipelineRecord[], context: PipelineRunContext): PipelineRecord[] {
  return records.filter((record) => isTruthy(evaluateExpression(step.where, { record: record.data, inputs: context.inputs })));
}
