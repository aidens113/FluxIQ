// A run's adaptive measures, stored on its detail as `adaptiveMetrics` when the
// detail is written (`./run-detail-writer.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioDecisionAppliedAutomatically } from "../../durable-behavior/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";
import { flowRunSummaryWithInterventionSummaries } from "./conversions.ts";

/**
 * The run's adaptive measures. A fix counts as a durable change once its
 * promotion decision says it was applied, which for an unattended fix is only
 * after the run's judged end: a detached patch's receipt
 * (`runtimePatchAttempts`) and a fix held in the run (`inRunRepairs`, C6 step
 * 8) alike. A deterministic success after adaptation is a resumed retry that
 * succeeded, or a run that succeeded with a fix it held in place.
 */
export function adaptiveRuntimeMetricsFromRunDetail(detail: AutomationStudioFlowRunDetail): JsonObject {
  const receipts = [...receiptsOf(detail, "runtimePatchAttempts"), ...receiptsOf(detail, "inRunRepairs")];
  const durableBehaviorChanged = receipts.some((receipt) => automationStudioDecisionAppliedAutomatically(receipt.approvalDecision));
  const tokenUsage = detail.summary.tokenUsage ?? flowRunSummaryWithInterventionSummaries(detail).tokenUsage;
  return compactJsonObject({
    llmCallCount: detail.interventions.filter((intervention) => intervention.provider || intervention.promptVersion || intervention.kind === "diagnosis" || intervention.kind === "runtime_patch").length,
    tokenCount: tokenUsage?.totalTokens ?? 0,
    estimatedCostUsd: tokenUsage?.estimatedCostUsd ?? 0,
    recoveryAttemptCount: detail.recoveryAttempts?.length ?? 0,
    adaptationApplyCount: durableBehaviorChanged ? 1 : 0,
    durableBehaviorChanged,
    deterministicSuccessAfterAdaptation: resumedRetrySucceeded(detail) || (detail.summary.status === "succeeded" && ((detail.failureCounts ?? detail.summary.failureCounts)?.repairedInRun ?? 0) > 0)
  });
}

function receiptsOf(detail: AutomationStudioFlowRunDetail, key: "runtimePatchAttempts" | "inRunRepairs"): JsonObject[] {
  const receipts = detail.metadata?.[key];
  return Array.isArray(receipts) ? receipts.filter(isJsonRecord) : [];
}

function resumedRetrySucceeded(detail: AutomationStudioFlowRunDetail): boolean {
  const retry = detail.metadata?.adaptiveRetry;
  return isJsonRecord(retry) && retry.status === "succeeded";
}
