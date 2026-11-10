import type { AutomationStudioFlowNode, ExecutableGraph } from "../../graph/index.ts";
import type { AutomationStudioFlowInterface } from "../../interface/index.ts";
import type { OutlinePathGraph } from "../graph/index.ts";
import type { FlowOutline } from "../types/index.ts";

/** What one edit reads: the outline the person edited, the graph it was made from, and that graph's path. */
export type OutlineEditContext = {
  outline: FlowOutline;
  graph: Pick<ExecutableGraph, "flowId" | "nodes" | "edges"> & { interface?: AutomationStudioFlowInterface };
  nodes: ReadonlyMap<string, AutomationStudioFlowNode>;
  paths: OutlinePathGraph;
};
