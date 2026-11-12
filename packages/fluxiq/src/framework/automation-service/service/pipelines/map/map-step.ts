import { canonicalJson, formatJsonPointer, type DataLineage, type DataStep } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { PipelineError } from "../errors.ts";
import { evaluateExpression } from "../expression/index.ts";
import { deriveRecord, keyOf } from "../steps/index.ts";
import type { FlowCallResult, PipelineCallInvocation, PipelineRecord, PipelineRunContext } from "../types.ts";
import { pipelineMapInvocations } from "./invocations.ts";
import { runLimited } from "./run-limited.ts";

type MapDeclaration = Extract<DataStep, { kind: "map" }>;

function callInputs(step: MapDeclaration, record: PipelineRecord, context: PipelineRunContext): JsonObject {
  const inputs: JsonObject = {};
  for (const [name, expression] of Object.entries(step.inputs)) {
    Object.defineProperty(inputs, name, { value: evaluateExpression(expression, { record: record.data, inputs: context.inputs }), enumerable: true, writable: true, configurable: true });
  }
  return inputs;
}

function underField(lineage: readonly DataLineage[], field: string): DataLineage[] {
  const prefix = formatJsonPointer([field]);
  return lineage.map((entry) => ({ ...entry, pointer: `${prefix}${entry.pointer}` }));
}

async function callOnce(step: MapDeclaration, inputs: JsonObject, context: PipelineRunContext, invocation: PipelineCallInvocation): Promise<FlowCallResult> {
  const { callFlow, state, now } = context.ports;
  if (callFlow === undefined) throw new PipelineError("pipeline.no_callFlow", `Step "${step.id}" calls a Flow, and no caller was given.`, step.id);
  const clock = now ?? Date.now;
  const callKey = canonicalJson({ target: step.target, inputs });
  if (step.reuseResultsForMs !== undefined && state !== undefined) {
    const reused = await state.getCachedCall(context.projectId, callKey, clock());
    if (reused !== undefined) return reused;
  }
  const result = await callFlow(step.target, inputs, context.signal, invocation);
  if (step.reuseResultsForMs !== undefined && state !== undefined) await state.putCachedCall(context.projectId, callKey, result, clock() + step.reuseResultsForMs);
  return result;
}

/**
 * Calls the step's Flow once per record, up to `concurrency` at a time, and puts the
 * outputs under `as`. Records come out in the order they went in.
 *
 * - incremental: a record whose `skipProcessedBy` key an earlier run of this pipeline
 *   processed (stored per project) is dropped without a call; a key is remembered only
 *   after its call succeeded, so a failed run repeats it;
 * - cached: with `reuseResultsForMs`, identical call inputs to the same target reuse the
 *   stored result while it is younger than that.
 */
export async function mapStep(step: MapDeclaration, records: readonly PipelineRecord[], context: PipelineRunContext): Promise<PipelineRecord[]> {
  const state = context.ports.state;
  const invocations = pipelineMapInvocations(step.id, records);
  if (step.skipProcessedBy !== undefined && state === undefined) throw new PipelineError("pipeline.no_state", `Step "${step.id}" skips processed records, and no pipeline state was given.`, step.id);
  const results = await runLimited(records.length, step.concurrency, async (index): Promise<PipelineRecord | null> => {
    if (context.signal?.aborted === true) throw new PipelineError("pipeline.aborted", "The pipeline was stopped.", step.id);
    const record = records[index] as PipelineRecord;
    const key = step.skipProcessedBy === undefined ? undefined : keyOf(record.data, step.skipProcessedBy);
    if (key !== undefined && state !== undefined && (await state.isProcessed(context.projectId, context.pipeline, step.id, key))) return null;
    const result = await callOnce(step, callInputs(step, record, context), context, invocations[index]!);
    if (key !== undefined && state !== undefined) await state.markProcessed(context.projectId, context.pipeline, step.id, key);
    const lineage = [...record.lineage, ...underField(result.lineage, step.as)];
    return deriveRecord(context, step.id, { ...record.data, [step.as]: result.outputs }, [`/${index}`], lineage);
  });
  return results.filter((record): record is PipelineRecord => record !== null);
}
