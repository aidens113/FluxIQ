import type { AutomationStudioFlowArtifact, AutomationStudioFlowErrorDefinition, AutomationStudioFlowExecutionDefaults, AutomationStudioFlowInterface, AutomationStudioFlowOrigin, AutomationStudioFlowRegion, AutomationStudioFlowRegionHandoff, AutomationStudioFlowScope, AutomationStudioFlowVariable, AutomationStudioFlowVisibility } from "../model/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../model/artifacts.ts";

export type AutomationStudioFlowDependency = { id: string; version: string; kind: "flow" | "node" | "schema" };

/** Framework-owned identity fields that must survive the generated-source round trip. */
export type AutomationStudioFlowDefinitionMetadata = {
  flowRepresentationVersion?: 1;
  flowRepresentationKind?: "orchestration" | "subflow_graph" | "legacy_single_graph";
  subflowGraph?: boolean;
  parentFlowId?: string;
  parentSubflowId?: string;
};

/** Declarative input accepted by defineFlow. It contains data, never callbacks. */
export type AutomationStudioFlowDefinition = {
  flowId: string;
  name: string;
  description?: string;
  scope?: AutomationStudioFlowScope;
  visibility?: AutomationStudioFlowVisibility;
  origin?: AutomationStudioFlowOrigin;
  metadata?: AutomationStudioFlowDefinitionMetadata;
  interface?: AutomationStudioFlowInterface;
  errors?: AutomationStudioFlowErrorDefinition[];
  variables?: AutomationStudioFlowVariable[];
  nodes?: AutomationStudioFlowNode[];
  edges?: AutomationStudioFlowEdge[];
  regions?: AutomationStudioFlowRegion[];
  regionHandoffs?: AutomationStudioFlowRegionHandoff[];
  executionDefaults?: AutomationStudioFlowExecutionDefaults;
  dependencies?: AutomationStudioFlowDependency[];
};

export type { FlowSourceLocation as AutomationStudioFlowSourceLocation, FlowCompilerDiagnostic as AutomationStudioFlowCompilerDiagnostic } from "../../../flows/executable/dsl/index.ts";
import type { CompiledFlowPlan, FlowCompilation } from "../../../flows/executable/dsl/index.ts";
export type AutomationStudioCompiledFlowPlan = CompiledFlowPlan<AutomationStudioFlowArtifact>;
export type AutomationStudioFlowCompilation = FlowCompilation<AutomationStudioFlowArtifact>;
