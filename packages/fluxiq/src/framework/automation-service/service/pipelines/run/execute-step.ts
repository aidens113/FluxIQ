import type { DataStep, DatasetRef } from "@fluxiq/contracts/fluxnode";
import { PipelineError } from "../errors.ts";
import { mapStep } from "../map/index.ts";
import { deliverSink } from "../sinks/index.ts";
import { aggregateStep, dedupeStep, filterStep, joinStep, limitStep, sortStep, transformStep, validateStep } from "../steps/index.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";

export type StepOutcome = { records: PipelineRecord[]; dataset?: DatasetRef };

async function rightSide(step: Extract<DataStep, { kind: "join" }>, earlier: ReadonlyMap<string, PipelineRecord[]>, context: PipelineRunContext): Promise<PipelineRecord[]> {
  if ("step" in step.with) {
    const found = earlier.get(step.with.step);
    if (found === undefined) throw new PipelineError("pipeline.unknown_step", `Step "${step.id}" joins "${step.with.step}", which has not run.`, step.id);
    return found;
  }
  const dataset = step.with.dataset;
  if (context.ports.readDataset === undefined) throw new PipelineError("pipeline.no_readDataset", `Step "${step.id}" joins a dataset, and no dataset reader was given.`, step.id);
  const rows = await context.ports.readDataset(dataset);
  return rows.map((data, index) => ({ data, lineage: [{ pointer: "", runId: context.runId, ...(context.flowId === undefined ? {} : { flowId: context.flowId }), stepId: step.id, source: { kind: "read" as const, readId: `${dataset.datasetId}:${index}` } }] }));
}

/** Runs one data step over its input records. `earlier` holds the output of every step that already ran, for a join. */
export async function executeDataStep(step: DataStep, input: readonly PipelineRecord[], earlier: ReadonlyMap<string, PipelineRecord[]>, context: PipelineRunContext): Promise<StepOutcome> {
  if (context.signal?.aborted === true) throw new PipelineError("pipeline.aborted", "The pipeline was stopped.", step.id);
  switch (step.kind) {
    case "map": return { records: await mapStep(step, input, context) };
    case "filter": return { records: filterStep(step, input, context) };
    case "transform": return { records: await transformStep(step, input, context) };
    case "dedupe": return { records: dedupeStep(step, input) };
    case "join": return { records: joinStep(step, input, await rightSide(step, earlier, context), context) };
    case "sort": return { records: sortStep(step, input) };
    case "limit": return { records: limitStep(step, input) };
    case "aggregate": return { records: aggregateStep(step, input, context) };
    case "validate": return { records: validateStep(step, input) };
    case "sink": {
      const dataset = await deliverSink(step.id, step.to, input, context);
      return dataset === undefined ? { records: [...input] } : { records: [...input], dataset };
    }
  }
}
