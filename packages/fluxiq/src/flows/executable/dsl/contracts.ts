import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableFlow, AutomationStudioFlowNode, AutomationStudioFlowEdge } from "../graph/index.ts";
import type { AutomationStudioNodeRegistry } from "../../../components/automation/index.ts";
import type { AutomationStudioValidationResult } from "../validation/index.ts";

export type FlowDependency = { id: string; version: string; kind: "flow" | "node" | "schema" };
/** Executable declarations contain data only. Program persistence travels outside this contract. */
export type FlowDefinition = {
  flowId: string; name: string; description?: string; scope?: ExecutableFlow["scope"];
  metadata?: JsonObject; interface?: ExecutableFlow["interface"]; errors?: ExecutableFlow["errors"];
  variables?: ExecutableFlow["variables"]; nodes?: AutomationStudioFlowNode[]; edges?: AutomationStudioFlowEdge[];
  regions?: ExecutableFlow["regions"]; regionHandoffs?: ExecutableFlow["regionHandoffs"];
  executionDefaults?: ExecutableFlow["executionDefaults"]; dependencies?: FlowDependency[];
};
export type FlowSourceLocation = { moduleId: string; line: number; column: number };
export type FlowCompilerDiagnostic = { severity: "error" | "warning" | "info"; code: string; message: string; path?: string; location?: FlowSourceLocation; remediation?: string };
export type CompiledFlowPlan<TFlow extends ExecutableFlow = ExecutableFlow> = {
  schemaVersion: "0.1"; compilerVersion: "0.1"; digest: string; flow: TFlow;
  nodeRegionIds: Record<string, string>; dependencyPins: FlowDependency[];
};
export type FlowCompilation<TFlow extends ExecutableFlow = ExecutableFlow> =
  | { ok: true; diagnostics: FlowCompilerDiagnostic[]; plan: CompiledFlowPlan<TFlow> }
  | { ok: false; diagnostics: FlowCompilerDiagnostic[] };
export type FlowCompilerOptions<TFlow extends ExecutableFlow = ExecutableFlow> = {
  registry?: AutomationStudioNodeRegistry;
  /** A program may compose its envelope validation with validateExecutableFlow. */
  validate?: (flow: TFlow) => AutomationStudioValidationResult;
  /** A program retains authority over its existing persisted digest envelope. */
  digest?: (flow: TFlow, dependencies: FlowDependency[]) => string;
};
export type FlowModuleImport = "fluxiq/flows/executable/dsl" | "fluxiq/automation-studio/dsl";
