// Turns a built pipeline, its inputs and the run options into the contracts' run request: the
// pipeline's definition goes to the engine, which compiles it into a Flow and registers it on the way.

import type { JsonObject } from "@fluxiq/contracts/core";
import type { FluxNodeRunRequestInput } from "@fluxiq/contracts/fluxnode";
import type { BuiltPipeline } from "../pipeline/index.ts";
import type { RunOptions } from "./run-types.ts";
import { withRunOptions } from "./with-run-options.ts";

/** The request that runs `built` over `inputs`. */
export function buildPipelineRunRequest(built: BuiltPipeline, inputs: JsonObject, options: RunOptions): FluxNodeRunRequestInput {
  return withRunOptions({ pipeline: built.definition, inputs }, options);
}
