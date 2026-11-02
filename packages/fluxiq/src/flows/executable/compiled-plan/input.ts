import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioCompiledPlanNode } from "./node.ts";
import type { AutomationStudioCompiledPlanEdge } from "./edge.ts";
import type { AutomationStudioCompiledPlanInstruction } from "./instruction.ts";

export type CompileAutomationStudioPlanInput = {
  projectId: string;
  flowId: string;
  flowRevision: number;
  graphRevision: number;
  settingsRevision: number;
  instructionRevision?: number;
  compiledAt?: number;
  compilerVersion?: string;
  nodes: AutomationStudioCompiledPlanNode[];
  edges: AutomationStudioCompiledPlanEdge[];
  resolvedSettings?: JsonObject;
  resolvedInstructions?: AutomationStudioCompiledPlanInstruction[];
  dependencies?: Array<{ kind: string; id: string; revision?: number; digest?: string }>;
  graphRevisionId?: string;
  graphDigest?: string;
};
