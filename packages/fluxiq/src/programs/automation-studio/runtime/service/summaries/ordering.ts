import type { AutomationStudioFlowRunSummary } from "../../../model/index.ts";
import type { AutomationStudioAdaptationSummary } from "../indexes/index.ts";

// Sort order for the summary listings that merge two sources and therefore
// cannot let SQL do the ordering: the comparator has to agree with the SQL
// ordering exactly, including the id tiebreak.
export function compareFlowAdaptationSummaries(
  left: AutomationStudioAdaptationSummary,
  right: AutomationStudioAdaptationSummary,
  sort: "updated" | "status" | "risk" | "trigger",
  direction: "asc" | "desc"
): number {
  const riskRank = (value: string): number => value === "destructive" ? 4 : value === "high" ? 3 : value === "medium" ? 2 : 1;
  const value = (adaptation: AutomationStudioAdaptationSummary): number | string => {
    if (sort === "status") return adaptation.status;
    if (sort === "risk") return riskRank(adaptation.riskLevel);
    if (sort === "trigger") return adaptation.trigger;
    return adaptation.updatedAt;
  };
  const leftValue = value(left);
  const rightValue = value(right);
  const compared = typeof leftValue === "number" && typeof rightValue === "number"
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue));
  const directed = direction === "asc" ? compared : -compared;
  if (directed !== 0) return directed;
  return direction === "asc" ? left.adaptationId.localeCompare(right.adaptationId) : right.adaptationId.localeCompare(left.adaptationId);
}

export function compareFlowRunSummaries(
  left: AutomationStudioFlowRunSummary,
  right: AutomationStudioFlowRunSummary,
  sort: "updated" | "started" | "duration" | "actions" | "status",
  direction: "asc" | "desc"
): number {
  const value = (run: AutomationStudioFlowRunSummary): number | string => {
    if (sort === "started") return run.startedAt ?? 0;
    if (sort === "duration") return (run.finishedAt ?? run.updatedAt) - (run.startedAt ?? run.updatedAt);
    if (sort === "actions") return run.actionAttemptCount ?? 0;
    if (sort === "status") return run.status;
    return run.updatedAt;
  };
  const leftValue = value(left);
  const rightValue = value(right);
  const compared = typeof leftValue === "number" && typeof rightValue === "number"
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue));
  const directed = direction === "asc" ? compared : -compared;
  if (directed !== 0) return directed;
  return direction === "asc" ? left.runId.localeCompare(right.runId) : right.runId.localeCompare(left.runId);
}
