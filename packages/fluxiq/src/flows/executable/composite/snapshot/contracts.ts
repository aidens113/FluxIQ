import type { AutomationStudioFlowScope } from "../../scope.ts";
import type { AutomationStudioFlowInterface, AutomationStudioFlowErrorDefinition, AutomationStudioFlowExecutionDefaults } from "../../interface/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowEdge } from "../../graph/index.ts";
import type { AutomationStudioFlowRegion, AutomationStudioFlowRegionHandoff } from "../../regions/index.ts";

/** Immutable executable content of a pinned Flow; publication metadata is external. */
export type ExecutableFlowSnapshot = {
  flowId: string;
  version: string;
  flowDigest: string;
  scope: AutomationStudioFlowScope;
  dependencies?: Array<{ flowId: string; version: string; flowDigest?: string }>;
  requiredRuntimeCapabilities?: string[];
  executionDefaults?: AutomationStudioFlowExecutionDefaults | undefined;
  interface: AutomationStudioFlowInterface;
  errors: AutomationStudioFlowErrorDefinition[];
  nodes: AutomationStudioFlowNode[];
  edges: AutomationStudioFlowEdge[];
  regions?: AutomationStudioFlowRegion[] | undefined;
  regionHandoffs?: AutomationStudioFlowRegionHandoff[] | undefined;
};
