import type { AutomationStudioCandidateAuthoringBinding, AutomationStudioCandidateAuthoringResult } from "./contracts.ts";

/** Parse the sanitized API payload, then bind it to the caller's original subject. */
export function parseAutomationStudioCandidateAuthoringResult(payload: unknown, expected: AutomationStudioCandidateAuthoringBinding): AutomationStudioCandidateAuthoringResult | null {
  if (!plain(payload) || Object.keys(payload).length !== 1 || !plain(payload.candidate)) return null;
  const c = payload.candidate;
  const fields = ["status", "projectId", "flowId", "candidateId", "revision", "digest", "sourceInstructionIds", "baseDependencyDigest", "baseSettingsRevision", "verification", "promotionAllowed", "accounting"];
  if (Object.keys(c).length !== fields.length || Object.keys(c).some((key) => !fields.includes(key))) return null;
  if (c.status !== "draft" || c.verification !== "not_performed" || c.promotionAllowed !== false || !identifier(c.projectId) || !identifier(c.flowId) || !identifier(c.candidateId) || !identifier(c.baseDependencyDigest)) return null;
  if (c.projectId !== expected.projectId || c.flowId !== expected.flowId || !whole(c.revision, 1) || !whole(c.baseSettingsRevision, 0) || typeof c.digest !== "string" || !/^[a-f0-9]{64}$/u.test(c.digest)) return null;
  if ((expected.candidateId !== undefined && c.candidateId !== expected.candidateId) || (expected.revision !== undefined && c.revision !== expected.revision) || (expected.digest !== undefined && c.digest !== expected.digest)) return null;
  if (!Array.isArray(c.sourceInstructionIds) || c.sourceInstructionIds.length > 100 || !c.sourceInstructionIds.every(identifier) || new Set(c.sourceInstructionIds).size !== c.sourceInstructionIds.length || !plain(c.accounting)) return null;
  const a = c.accounting, keys = ["requestId", "estimatedInputTokens", "provider", "model", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"];
  if (Object.keys(a).some((key) => !keys.includes(key)) || !identifier(a.requestId) || !whole(a.estimatedInputTokens, 0)) return null;
  for (const key of ["inputTokens", "outputTokens", "totalTokens"]) if (key in a && !whole(a[key], 0)) return null;
  for (const key of ["provider", "model"]) if (key in a && (!identifier(a[key]) || (a[key] as string).length > 100)) return null;
  if ("estimatedCostUsd" in a && (typeof a.estimatedCostUsd !== "number" || !Number.isFinite(a.estimatedCostUsd) || a.estimatedCostUsd < 0 || a.estimatedCostUsd > 10)) return null;
  const result = structuredClone(c) as AutomationStudioCandidateAuthoringResult;
  Object.freeze(result.accounting); Object.freeze(result.sourceInstructionIds);
  return Object.freeze(result);
}
function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every((key) => typeof key === "string" && Object.getOwnPropertyDescriptor(value, key)?.get === undefined && Object.getOwnPropertyDescriptor(value, key)?.set === undefined);
}
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 200 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value); }
function whole(value: unknown, minimum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum; }
