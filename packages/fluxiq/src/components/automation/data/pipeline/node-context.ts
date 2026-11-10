import type { JsonObject } from "../../../../core/index.ts";
import type { PipelineRunContext } from "../../../../framework/automation-service/service/pipelines/index.ts";

/**
 * What a compiled pipeline node runs with when the engine runs it as an ordinary node: the node's own
 * inputs, and no ports. A node's context carries none, so a step that needs one (a Flow call, a dataset,
 * a file, a callback) refuses with a `PipelineError`; the FluxNode runner runs a whole pipeline with its
 * ports through `runCompiledPipelineFlow`.
 */
export function pipelineNodeContext(inputs: JsonObject): PipelineRunContext {
  return { runId: "pipeline-node", projectId: "pipeline-node", pipeline: "pipeline-node", inputs, ports: {} };
}
