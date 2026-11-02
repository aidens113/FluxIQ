import type { ExecutableGraph } from "../graph.ts";
import type { AutomationStudioFlowScope } from "../../index.ts";
import type { AutomationStudioFlowInterface, AutomationStudioFlowErrorDefinition, AutomationStudioFlowVariable, AutomationStudioFlowExecutionDefaults } from "../../interface/index.ts";
import type { AutomationStudioFlowRegion, AutomationStudioFlowRegionHandoff } from "../../regions/index.ts";

/** The complete executable contract, without project/editor/publication state. */
export type ExecutableFlow = ExecutableGraph & {
  name: string;
  description?: string;
  scope: AutomationStudioFlowScope;
  interface: AutomationStudioFlowInterface;
  errors: AutomationStudioFlowErrorDefinition[];
  variables: AutomationStudioFlowVariable[];
  regions?: AutomationStudioFlowRegion[];
  regionHandoffs?: AutomationStudioFlowRegionHandoff[];
  executionDefaults?: AutomationStudioFlowExecutionDefaults;
};

export type AutomationStudioFlowArtifact = ExecutableFlow;
