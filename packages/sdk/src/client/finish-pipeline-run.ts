// Turns a pipeline run's `ended` result into what the program gets: for an achieved run every output record is
// checked once more against the pipeline's declared output type, so typed records are never a lie; the other
// three endings come back as they are.

import type { FluxNodeRunResult } from "@fluxiq/contracts/fluxnode";
import { validateJsonValue } from "@fluxiq/contracts/fluxnode";
import { SdkError } from "../errors/index.ts";
import type { BuiltPipeline } from "../pipeline/index.ts";
import type { AchievedPipelineRun, PipelineOutcome } from "./pipeline-run-types.ts";

/** The program's view of `result`. Throws `invalid_outputs` when an achieved run's records miss the declared type. */
export function finishPipelineRun<R>(built: BuiltPipeline, result: FluxNodeRunResult): PipelineOutcome<R> {
  if (result.status !== "achieved") return { ...result, status: result.status };
  if (!Array.isArray(result.outputs)) throw new SdkError("protocol", `The pipeline run ${result.runId} was achieved but carries no list of records.`);
  const declared = built.definition.outputs;
  if (declared !== undefined) {
    const problems = result.outputs.flatMap((record, index) => validateJsonValue(declared, record).map((error) => `record ${index} ${error.path || "(record)"}: ${error.message}`));
    if (problems.length > 0) throw new SdkError("invalid_outputs", `The engine's records for "${built.definition.name}" do not fit its declared type:\n  ${problems.slice(0, 10).join("\n  ")}`);
  }
  const achieved: AchievedPipelineRun<R> = { ...result, status: "achieved", outputs: result.outputs as R[] };
  return achieved;
}
