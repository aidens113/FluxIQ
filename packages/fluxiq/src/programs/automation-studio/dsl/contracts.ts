import type { AutomationStudioFlowArtifact, AutomationStudioFlowErrorDefinition, AutomationStudioFlowExecutionDefaults, AutomationStudioFlowInterface, AutomationStudioFlowOrigin, AutomationStudioFlowRegion, AutomationStudioFlowRegionHandoff, AutomationStudioFlowScope, AutomationStudioFlowVariable, AutomationStudioFlowVisibility } from "../model/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../model/artifacts.ts";

export type AutomationStudioFlowDependency = { id: string; version: string; kind: "flow" | "node" | "schema" };

/** Declarative input accepted by defineFlow. It contains data, never callbacks. */
export type AutomationStudioFlowDefinition = {
  flowId: string;
  name: string;
  description?: string;
  scope?: AutomationStudioFlowScope;
  visibility?: AutomationStudioFlowVisibility;
  origin?: AutomationStudioFlowOrigin;
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

export type AutomationStudioFlowSourceLocation = { moduleId: string; line: number; column: number };
export type AutomationStudioFlowCompilerDiagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path?: string;
  location?: AutomationStudioFlowSourceLocation;
  remediation?: string;
};

export type AutomationStudioCompiledFlowPlan = {
  schemaVersion: "0.1";
  compilerVersion: "0.1";
  digest: string;
  flow: AutomationStudioFlowArtifact;
  nodeRegionIds: Record<string, string>;
  dependencyPins: AutomationStudioFlowDependency[];
};

export type AutomationStudioFlowCompilation =
  | { ok: true; diagnostics: AutomationStudioFlowCompilerDiagnostic[]; plan: AutomationStudioCompiledFlowPlan }
  | { ok: false; diagnostics: AutomationStudioFlowCompilerDiagnostic[] };
