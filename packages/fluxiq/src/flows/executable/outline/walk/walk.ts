import type { AutomationStudioFlowNode, ExecutableGraph } from "../../graph/index.ts";
import type { OutlinePathGraph } from "../graph/index.ts";
import type { FlowOutlineOptions, OutlineStep } from "../types/index.ts";

/**
 * One outlining pass over a graph: what it reads, the nodes it has placed so
 * far, and the jump steps whose words wait for the numbering.
 */
export type OutlineWalk = {
  graph: Pick<ExecutableGraph, "nodes" | "edges">;
  nodes: ReadonlyMap<string, AutomationStudioFlowNode>;
  paths: OutlinePathGraph;
  options: FlowOutlineOptions;
  /** The names of the Flow's outputs, for "Give back ...". */
  outputs: readonly string[];
  visited: Set<string>;
  jumps: OutlineStep[];
};
