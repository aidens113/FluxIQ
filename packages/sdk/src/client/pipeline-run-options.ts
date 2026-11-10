import type { BuiltPipeline } from "../pipeline/index.ts";
import type { RunOptions } from "./run-types.ts";

/** The options a pipeline run goes with: the built pipeline's function transforms and sinks, then the program's own `transforms` over them. */
export function pipelineRunOptions(built: BuiltPipeline, options: RunOptions): RunOptions {
  return { ...options, transforms: { ...built.callbacks, ...(options.transforms ?? {}) } };
}
