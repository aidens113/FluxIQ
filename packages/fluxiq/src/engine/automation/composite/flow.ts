import type { ExecutableGraph, ExecutableFlow } from "../../../flows/executable/graph/index.ts";

/** Root execution/composition facts; no project, editor, or publication envelope. */
export type AutomationStudioCompositeFlow = Pick<ExecutableGraph, "flowId" | "nodes" | "edges" | "metadata"> & {
  scope: ExecutableFlow["scope"];
  executionDefaults?: ExecutableFlow["executionDefaults"];
  regions?: ExecutableFlow["regions"];
  regionHandoffs?: ExecutableFlow["regionHandoffs"];
};
