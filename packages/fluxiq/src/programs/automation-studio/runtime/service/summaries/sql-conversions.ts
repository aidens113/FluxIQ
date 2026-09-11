import type { AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import type { AutomationStudioAdaptationSummary } from "../indexes/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import type {
  AutomationStudioFlowSubflow,
  AutomationStudioFlowInstruction
} from "../../../model/index.ts";
import type {
  AutomationStudioSqlInstructionScope,
  AutomationStudioSqlInstructionSummary,
  AutomationStudioSqlSubflow
} from "../../../storage/index.ts";
import type { AutomationStudioInstructionSummary, AutomationStudioSubflowSummary } from "../indexes/index.ts";

// Reading a row of the typed SQL projection back as the summary shape the
// JSON index would have produced, so a caller cannot tell which side served
// the page.

export function subflowSummaryFromSql(subflow: AutomationStudioSqlSubflow, projectId: string): AutomationStudioSubflowSummary {
  return {
    subflowId: subflow.subflowId,
    summaryVersion: 2,
    graphFlowId: subflow.graphFlowId,
    flowId: subflow.parentFlowId,
    projectId,
    name: subflow.name,
    role: subflow.role as AutomationStudioFlowSubflow["role"],
    status: flowExpansionStatusFromSql(subflow.status),
    ...(subflow.parentCategoryId ? { parentCategoryId: subflow.parentCategoryId } : {}),
    updatedAt: subflow.updatedAt
  };
}

export function instructionSummaryFromSql(instruction: AutomationStudioSqlInstructionSummary, fallbackProjectId: string): AutomationStudioInstructionSummary {
  const scope = instruction.scope;
  return {
    instructionId: instruction.instructionId,
    summaryVersion: 2,
    projectId: scope?.projectId ?? fallbackProjectId,
    ...(scope?.flowId ? { flowId: scope.flowId } : {}),
    ...(scope?.subflowId ? { subflowId: scope.subflowId } : {}),
    title: instruction.title,
    scopeKind: instructionScopeKindFromSql(scope?.scopeKind),
    status: instructionStatusFromSql(instruction.status),
    requirement: instructionRequirementFromSql(instruction.requirement),
    priority: instruction.priority,
    updatedAt: instruction.updatedAt
  };
}

export function sqlInstructionScopeKind(scopeKind: string): AutomationStudioSqlInstructionScope["scopeKind"] {
  if (scopeKind === "on_error") return "error";
  if (scopeKind === "adaptation_review") return "flow";
  return scopeKind === "global" || scopeKind === "project" || scopeKind === "flow" || scopeKind === "router" || scopeKind === "subflow" || scopeKind === "node" || scopeKind === "error" ? scopeKind : "flow";
}

export function instructionScopeKindFromSql(scopeKind: AutomationStudioSqlInstructionScope["scopeKind"] | undefined): AutomationStudioInstructionSummary["scopeKind"] {
  if (scopeKind === "error") return "on_error";
  return (scopeKind ?? "flow") as AutomationStudioInstructionSummary["scopeKind"];
}

export function instructionRequirementFromSql(requirement: "guidance" | "required" | "forbidden"): AutomationStudioInstructionSummary["requirement"] {
  return requirement === "required" ? "required" : "advisory";
}

export function instructionStatusFromSql(status: "draft" | "active" | "archived" | "deleted"): AutomationStudioInstructionSummary["status"] {
  if (status === "draft" || status === "deleted") return "disabled";
  return status;
}

export function flowExpansionStatusFromSql(status: string): AutomationStudioFlowSubflow["status"] {
  return status === "archived" ? "archived" : "active";
}

export function adaptationSummaryFromTypedStore(adaptation: { adaptationId: string; flowId: string; projectId: string; subflowId: string | null; status: AutomationStudioFlowAdaptation["status"]; riskLevel: AutomationStudioFlowAdaptation["riskLevel"]; trigger: string; updatedAt: number; patchCount?: number; evidenceCount?: number; approvalMode?: string; baseRevision?: number; appliedRevision?: number | null }): AutomationStudioAdaptationSummary {
  return compactJsonObject({
    adaptationId: adaptation.adaptationId,
    flowId: adaptation.flowId,
    projectId: adaptation.projectId,
    ...(adaptation.subflowId ? { subflowId: adaptation.subflowId } : {}),
    status: adaptation.status,
    riskLevel: adaptation.riskLevel,
    trigger: adaptation.trigger,
    updatedAt: adaptation.updatedAt,
    patchCount: adaptation.patchCount,
    evidenceCount: adaptation.evidenceCount,
    approvalMode: adaptation.approvalMode,
    baseRevision: adaptation.baseRevision,
    appliedRevision: adaptation.appliedRevision ?? undefined
  }) as unknown as AutomationStudioAdaptationSummary;
}
