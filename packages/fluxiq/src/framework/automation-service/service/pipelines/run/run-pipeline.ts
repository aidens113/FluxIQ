import { parseDataPipeline, validateJsonValue, type DataPipeline, type DataPipelineInput, type DatasetRef } from "@fluxiq/contracts/fluxnode";
import { PipelineError } from "../errors.ts";
import { PipelineRejectedError } from "../rejected-error.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";
import { executeDataStep } from "./execute-step.ts";
import { loadPipelineSource } from "./load-source.ts";

export type PipelineRunOutcome = {
  /** The records of the last step, with their lineage. */
  records: PipelineRecord[];
  /** The datasets the sinks stored, in step order. */
  datasets: DatasetRef[];
  /** How many records each step gave, by step id. */
  counts: Record<string, number>;
};

/** Checks the inputs against the declared type and fills the step defaults. */
export function readPipeline(definition: DataPipelineInput | DataPipeline): DataPipeline {
  const parsed = parseDataPipeline(definition);
  if (!parsed.ok) throw new PipelineError("pipeline.invalid", `The pipeline is not valid: ${parsed.issues[0]?.path ?? ""} ${parsed.issues[0]?.message ?? ""}`.trim());
  return parsed.value;
}

/**
 * Runs a pipeline step by step, directly, with no Flow: the source, then each step on
 * the records of the step before it (or the step its `input` names), then the check of
 * the final records against the declared output type. Lineage rides on every record.
 * A step that cannot run throws `PipelineError`; invalid records under `reject` throw
 * `PipelineRejectedError`.
 */
export async function runPipeline(definition: DataPipelineInput | DataPipeline, context: PipelineRunContext): Promise<PipelineRunOutcome> {
  const pipeline = readPipeline(definition);
  if (pipeline.inputs !== undefined) {
    const errors = validateJsonValue(pipeline.inputs, context.inputs);
    if (errors.length > 0) throw new PipelineError("pipeline.bad_inputs", `The inputs do not fit the pipeline at "${errors[0]?.path}": ${errors[0]?.message}`);
  }
  let current = await loadPipelineSource(pipeline, context);
  const outputs = new Map<string, PipelineRecord[]>();
  const datasets: DatasetRef[] = [];
  const counts: Record<string, number> = {};
  for (const step of pipeline.steps) {
    const input = step.input === undefined ? current : (outputs.get(step.input) as PipelineRecord[]);
    const outcome = await executeDataStep(step, input, outputs, context);
    current = outcome.records;
    outputs.set(step.id, current);
    counts[step.id] = current.length;
    if (outcome.dataset !== undefined) datasets.push(outcome.dataset);
  }
  if (pipeline.outputs !== undefined) {
    const outputType = pipeline.outputs;
    const problems = current.flatMap((record, index) => validateJsonValue(outputType, record.data).map((error) => ({ index, path: error.path, message: error.message })));
    if (problems.length > 0) throw new PipelineRejectedError("outputs", problems);
  }
  return { records: current, datasets, counts };
}
