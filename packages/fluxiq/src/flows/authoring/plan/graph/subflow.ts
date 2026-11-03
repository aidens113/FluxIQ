import type { AutomationStudioFlowBootstrapInterface, AutomationStudioFlowBootstrapNode } from "../index.ts";
import type { AutomationStudioFlowBootstrapEdge } from "./edge.ts";
import type { AutomationStudioFlowBootstrapSubflowMetadata } from "./subflow-metadata.ts";

export type AutomationStudioFlowBootstrapSubflow = {
  key: string;
  name: string;
  role: "primary" | "integration" | "recovery" | "fallback" | "utility";
  nodes: AutomationStudioFlowBootstrapNode[];
  edges: AutomationStudioFlowBootstrapEdge[];
  /** A callable part's interface; absent for a Subflow the router runs, whose interface is the Flow's. */
  interface?: AutomationStudioFlowBootstrapInterface;
  metadata?: AutomationStudioFlowBootstrapSubflowMetadata;
};
