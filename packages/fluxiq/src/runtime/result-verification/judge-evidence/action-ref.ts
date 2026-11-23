import { automationStudioResultEvidenceScreen } from "../result-evidence/index.ts";

/** An actual Core settlement links one dispatched call to its act record. */
export type AutomationStudioJudgeActionRef = { callId: string; actId: string };

export function automationStudioReadJudgeActionRef(value: unknown): AutomationStudioJudgeActionRef | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const held = value as Record<string, unknown>;
  if (Object.keys(held).some((key) => key !== "callId" && key !== "actId") || typeof held.callId !== "string" || !held.callId.trim() || typeof held.actId !== "string" || !held.actId.trim()) return undefined;
  const ref = { callId: held.callId, actId: held.actId };
  return automationStudioResultEvidenceScreen(ref, []).withheld ? undefined : ref;
}
