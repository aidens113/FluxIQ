// Turns a built pipeline, its inputs and the run options into the contracts' run request: the
// pipeline's definition goes to the engine, which compiles it into a Flow and registers it on the way.

import type { JsonObject } from "@fluxiq/contracts/core";
import { FLUXNODE_PIPELINE_OVERRIDES_MESSAGE, type FluxNodeRunRequestInput } from "@fluxiq/contracts/fluxnode";
import { SdkError } from "../errors/index.ts";
import type { BuiltPipeline } from "../pipeline/index.ts";
import type { RunOptions } from "./run-types.ts";
import { splitRunOverrides } from "./split-run-overrides.ts";
import { withRunOptions } from "./with-run-options.ts";

/** The request that runs `built` over `inputs`. Options pass on; overrides are refused before any request (they belong to one FluxNode). */
export function buildPipelineRunRequest(built: BuiltPipeline, inputs: JsonObject, options: RunOptions): FluxNodeRunRequestInput {
  if (options.overrides !== undefined && splitRunOverrides(options.overrides).overrides !== undefined) throw new SdkError("run_request.overrides_on_pipeline", FLUXNODE_PIPELINE_OVERRIDES_MESSAGE);
  return withRunOptions({ pipeline: built.definition, inputs }, options);
}
