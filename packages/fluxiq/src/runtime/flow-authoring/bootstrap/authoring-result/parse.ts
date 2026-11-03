import type { AutomationStudioCandidateAuthoringBinding, AutomationStudioCandidateAuthoringResult, AutomationStudioCandidateProposalResult } from "./contracts.ts";

const TRIAL_VERDICTS: readonly string[] = ["yes", "no", "unsure", "not_judged", "execution_failed", "not_tested"];

/** Parse the sanitized API payload, then bind it to the caller's original subject. */
export function parseAutomationStudioCandidateAuthoringResult(payload: unknown, expected: AutomationStudioCandidateAuthoringBinding): AutomationStudioCandidateAuthoringResult | null {
  if (!plain(payload) || Object.keys(payload).length !== 1 || !plain(payload.candidate)) return null;
  const c = payload.candidate;
  const fields = ["status", "projectId", "flowId", "candidateId", "revision", "digest", "sourceInstructionIds", "baseDependencyDigest", "baseSettingsRevision", "verification", "promotionAllowed", "accounting"];
  const trialed = Object.hasOwn(c, "trial");
  if (Object.keys(c).length !== fields.length + (trialed ? 1 : 0) || Object.keys(c).some((key) => !fields.includes(key) && key !== "trial")) return null;
  if (c.status !== "draft" || c.verification !== "not_performed" || c.promotionAllowed !== false || !identifier(c.projectId) || !identifier(c.flowId) || !identifier(c.candidateId) || !identifier(c.baseDependencyDigest)) return null;
  if (c.projectId !== expected.projectId || c.flowId !== expected.flowId || !whole(c.revision, 1) || !whole(c.baseSettingsRevision, 0) || !digest(c.digest)) return null;
  if ((expected.candidateId !== undefined && c.candidateId !== expected.candidateId) || (expected.revision !== undefined && c.revision !== expected.revision) || (expected.digest !== undefined && c.digest !== expected.digest)) return null;
  if (!Array.isArray(c.sourceInstructionIds) || c.sourceInstructionIds.length > 100 || !c.sourceInstructionIds.every(identifier) || new Set(c.sourceInstructionIds).size !== c.sourceInstructionIds.length || !plain(c.accounting)) return null;
  if (trialed && !draftTrial(c.trial)) return null;
  const a = c.accounting, keys = ["requestId", "estimatedInputTokens", "provider", "model", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"];
  if (Object.keys(a).some((key) => !keys.includes(key)) || !identifier(a.requestId) || !whole(a.estimatedInputTokens, 0)) return null;
  for (const key of ["inputTokens", "outputTokens", "totalTokens"]) if (key in a && !whole(a[key], 0)) return null;
  for (const key of ["provider", "model"]) if (key in a && (!identifier(a[key]) || (a[key] as string).length > 100)) return null;
  if ("estimatedCostUsd" in a && (typeof a.estimatedCostUsd !== "number" || !Number.isFinite(a.estimatedCostUsd) || a.estimatedCostUsd < 0 || a.estimatedCostUsd > 10)) return null;
  const result = structuredClone(c) as AutomationStudioCandidateAuthoringResult;
  Object.freeze(result.accounting); Object.freeze(result.sourceInstructionIds);
  if (result.trial) { Object.freeze(result.trial.codes); Object.freeze(result.trial); }
  return Object.freeze(result);
}

/**
 * Parse a candidate's proposal (`{ adaptation }`, t340): a proposed adaptation
 * that names the candidate, revision, digest and trial run whose confirmed yes
 * made it. Null for anything else -- a legacy proposal, a proposal without the
 * candidate block, or one bound to another Flow -- so a caller never applies a
 * change no trial stands behind.
 */
export function parseAutomationStudioCandidateProposalResult(payload: unknown, expected: { projectId: string; flowId: string }): AutomationStudioCandidateProposalResult | null {
  if (!plain(payload) || Object.keys(payload).length !== 1 || !plain(payload.adaptation)) return null;
  const p = payload.adaptation;
  const fields = ["status", "projectId", "flowId", "adaptationId", "riskLevel", "sourceInstructionIds", "baseDependencyDigest", "baseSettingsRevision", "accounting", "candidate", "permissionRequest"];
  if (Object.keys(p).some((key) => !fields.includes(key))) return null;
  if (p.status !== "proposed" || !identifier(p.adaptationId) || !identifier(p.projectId) || !identifier(p.flowId) || p.projectId !== expected.projectId || p.flowId !== expected.flowId) return null;
  const c = p.candidate;
  if (!plain(c) || Object.keys(c).length !== 4 || !identifier(c.candidateId) || !whole(c.revision, 1) || !digest(c.digest) || !plain(c.trial)) return null;
  const t = c.trial;
  // A yes stands only once a second call confirmed it (t296), so the trial behind a proposal made at least two judge calls.
  if (Object.keys(t).length !== 3 || !identifier(t.runId) || t.verdict !== "yes" || !whole(t.calls, 2)) return null;
  const trial = Object.freeze({ runId: t.runId, verdict: "yes" as const, calls: t.calls });
  return Object.freeze({ status: "proposed" as const, projectId: p.projectId, flowId: p.flowId, adaptationId: p.adaptationId,
    awaitingPermission: p.permissionRequest !== undefined && p.permissionRequest !== null,
    candidate: Object.freeze({ candidateId: c.candidateId, revision: c.revision, digest: c.digest, trial }) });
}

/** A draft's trial block: a known verdict, an optional run id, and Core's codes. */
function draftTrial(value: unknown): boolean {
  if (!plain(value) || Object.keys(value).some((key) => key !== "verdict" && key !== "runId" && key !== "codes") || !TRIAL_VERDICTS.includes(value.verdict as string)) return false;
  if (Object.hasOwn(value, "runId") && !identifier(value.runId)) return false;
  return Array.isArray(value.codes) && value.codes.length <= 20 && value.codes.every(identifier);
}
function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every((key) => typeof key === "string" && Object.getOwnPropertyDescriptor(value, key)?.get === undefined && Object.getOwnPropertyDescriptor(value, key)?.set === undefined);
}
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 200 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value); }
function whole(value: unknown, minimum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum; }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
