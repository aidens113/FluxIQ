import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";

// Translating between a Flow adaptation and the typed adaptation store: the
// detail it reads back, the approval mode it records, and the evidence and
// decision history it keeps in metadata.

export function adaptationFromTypedStoreDetail(detail: { adaptation: AutomationStudioFlowAdaptation; revisions?: unknown; artifacts?: unknown[]; auditEvents?: unknown[]; auditTotal?: number; approvalMode?: string; baseRevision?: number; appliedRevision?: number | null; statusReason?: string; supersededByAdaptationId?: string | null }): AutomationStudioFlowAdaptation {
  return {
    ...detail.adaptation,
    metadata: compactJsonObject({
      ...(detail.adaptation.metadata ?? {}),
      ...(detail.approvalMode === "manual_approval" ? { proposalModeOverride: "manual" } : {}),
      phase9: compactJsonObject({
        revisions: isJsonRecord(detail.revisions) ? detail.revisions : {},
        artifacts: Array.isArray(detail.artifacts) ? detail.artifacts : [],
        auditEvents: Array.isArray(detail.auditEvents) ? detail.auditEvents : [],
        auditTotal: detail.auditTotal,
        approvalMode: detail.approvalMode,
        baseRevision: detail.baseRevision,
        appliedRevision: detail.appliedRevision ?? undefined,
        statusReason: detail.statusReason,
        supersededByAdaptationId: detail.supersededByAdaptationId ?? undefined
      })
    })
  };
}

export function adaptationApprovalModeForStore(adaptation: AutomationStudioFlowAdaptation): "adaptive" | "manual_approval" | "disabled" {
  if (adaptation.status === "disabled") return "disabled";
  const value = adaptation.metadata?.proposalModeOverride ?? adaptation.metadata?.approvalMode;
  if (value === "manual" || value === "manual_approval") return "manual_approval";
  if (value === "disabled" || value === "deterministic") return "disabled";
  return "adaptive";
}

export function adaptationEvidenceForStore(adaptation: AutomationStudioFlowAdaptation): JsonObject | undefined {
  const evidence = compactJsonObject({ observedState: adaptation.observedState, expectedState: adaptation.expectedState, failedAction: adaptation.failedAction, diagnosis: adaptation.diagnosis });
  return Object.keys(evidence).length ? evidence : undefined;
}

export function approvalDecisionHistory(metadata: JsonObject | undefined): JsonObject[] {
  const history = metadata?.approvalDecisions;
  return Array.isArray(history) ? history.filter(isJsonRecord).slice(-20) : [];
}
