import { validateJsonValue, type DataPipeline, type FluxNodeIssue } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";

/** Every reason `inputs` do not fit the pipeline's declared input type, as issues under `/inputs`; none says they fit. */
export function pipelineInputIssues(pipeline: Pick<DataPipeline, "inputs">, inputs: JsonObject): FluxNodeIssue[] {
  if (pipeline.inputs === undefined) return [];
  return validateJsonValue(pipeline.inputs, inputs).map((error) => ({ path: `/inputs${error.path}`, code: `inputs.${error.code}`, message: error.message }));
}
