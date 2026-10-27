import type { AutomationStudioResultRequestedOutput, AutomationStudioRunResultSummary } from "../contracts/index.ts";

/**
 * What a run owes by the build's own declaration (`./index.ts`): `declared`
 * where the caller holds it, otherwise each part of the judge's task checklist
 * whose declared answer is records. Undefined where none is owed: a request
 * for an act, or a build that declared nothing. Never read off the request's
 * words.
 */
export function automationStudioResultRequestedOutputOwed(
  summary: AutomationStudioRunResultSummary,
  declared?: AutomationStudioResultRequestedOutput | undefined
): AutomationStudioResultRequestedOutput | undefined {
  const parts = declared?.parts
    ?? (summary.taskChecklist?.asked ?? []).flatMap((part) => (part.answer?.kind === "records" ? [{ part: part.part, columns: part.answer.columns }] : []));
  return parts.length ? { parts: parts.map((part) => ({ part: part.part, columns: [...part.columns] })) } : undefined;
}
