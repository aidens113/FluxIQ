import type { JsonObject } from "../../../core/index.ts";
import type { AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION } from "./schema-version.ts";
import type { AutomationStudioCompiledPlanNode } from "./node.ts";
import type { AutomationStudioCompiledPlanEdge } from "./edge.ts";
import type { AutomationStudioCompiledPlanInstruction } from "./instruction.ts";

export type AutomationStudioCompiledPlan = {
  schemaVersion: typeof AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION;
  compilerVersion: string;
  projectId: string;
  flowId: string;
  flowRevision: number;
  graphRevision: number;
  settingsRevision: number;
  instructionRevision: number;
  compiledAt: number;
  planDigest: string;
  startNodeId: string | null;
  nodes: AutomationStudioCompiledPlanNode[];
  edges: AutomationStudioCompiledPlanEdge[];
  edgesBySource: Record<string, string[]>;
  dependencies: Array<{ kind: string; id: string; revision?: number; digest?: string }>;
  resolvedSettings: JsonObject;
  resolvedInstructions: AutomationStudioCompiledPlanInstruction[];
  provenance: {
    graphRevisionId?: string;
    graphDigest?: string;
    settingsDigest: string;
    instructionDigest: string;
    nodeCount: number;
    edgeCount: number;
  };
};
