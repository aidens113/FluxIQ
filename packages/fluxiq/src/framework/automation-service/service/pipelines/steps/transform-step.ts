import { isJsonObject, type DataStep } from "@fluxiq/contracts/fluxnode";
import { PipelineError } from "../errors.ts";
import { evaluateExpression } from "../expression/index.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";
import { deriveRecord } from "./derive-record.ts";

const DEFAULT_BATCH = 1000;

/**
 * Replaces each record with the value of `expression`, which must be an object, or with
 * what the callback of the program answers for it, `batchSize` records at a time (one
 * answer per record, in order).
 */
export async function transformStep(step: Extract<DataStep, { kind: "transform" }>, records: readonly PipelineRecord[], context: PipelineRunContext): Promise<PipelineRecord[]> {
  if (step.expression !== undefined) {
    const expression = step.expression;
    return records.map((record, index) => {
      const value = evaluateExpression(expression, { record: record.data, inputs: context.inputs });
      if (!isJsonObject(value)) throw new PipelineError("pipeline.transform_not_object", `Step "${step.id}": the expression gave ${value === null ? "null" : typeof value}, not a record.`, step.id);
      return deriveRecord(context, step.id, value, [`/${index}`], record.lineage);
    });
  }
  const sdk = context.ports.sdk;
  if (sdk === undefined || step.callback === undefined) throw new PipelineError("pipeline.no_sdk", `Step "${step.id}" needs a callback of the program, and no program is connected.`, step.id);
  const batchSize = step.batchSize ?? DEFAULT_BATCH;
  const out: PipelineRecord[] = [];
  for (let start = 0; start < records.length; start += batchSize) {
    if (context.signal?.aborted === true) throw new PipelineError("pipeline.aborted", "The pipeline was stopped.", step.id);
    const batch = records.slice(start, start + batchSize);
    const answer = await sdk.transform({ stepId: step.id, callback: step.callback, records: batch.map((record) => record.data) });
    if (answer.length !== batch.length) throw new PipelineError("pipeline.transform_count", `Step "${step.id}": callback "${step.callback}" answered ${answer.length} records for ${batch.length}.`, step.id);
    batch.forEach((record, offset) => {
      const data = answer[offset];
      if (!isJsonObject(data)) throw new PipelineError("pipeline.transform_not_object", `Step "${step.id}": callback "${step.callback}" answered something that is not a record.`, step.id);
      out.push(deriveRecord(context, step.id, data, [`/${start + offset}`], record.lineage));
    });
  }
  return out;
}
