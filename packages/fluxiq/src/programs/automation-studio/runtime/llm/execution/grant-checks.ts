// The checks and coercions a grant's own methods lean on, none of which touch
// the store.
//
// They moved out of `grants.ts` when it went past its line limit, and the split
// is along the seam that was already there: everything here is a pure function
// of its arguments, so none of it needed the service and none of it could be
// read without scrolling past the service to find it.

import {
  AUTOMATION_STUDIO_DEEPSEEK_MODELS,
  automationStudioDeepSeekModelRefusal,
  isAutomationStudioDeepSeekModel,
  type AutomationStudioDeepSeekModel
} from "../deepseek/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL } from "../deepseek/index.ts";
import type { AutomationStudioLlmExecutionBinding } from "./grants.ts";
import type { AutomationStudioLlmExecutionGrantPurpose } from "../grant-capabilities.ts";

export function validateKeyCompatibility(key: { provider?: string | undefined; scope: string; scopeRef?: string | undefined; metadata?: Record<string, unknown> | undefined }, input: { provider?: string; model?: string; flowId: string }): AutomationStudioDeepSeekModel {
  if ((input.provider ?? key.provider)?.trim().toLowerCase() !== "deepseek" || (key.provider && key.provider.trim().toLowerCase() !== "deepseek")) throw new Error("LLM provider mismatch.");
  const keyModel = typeof key.metadata?.model === "string" ? key.metadata.model : undefined;
  if (keyModel !== undefined && !isAutomationStudioDeepSeekModel(keyModel)) throw new Error(automationStudioDeepSeekModelRefusal(keyModel));
  const requested = input.model;
  if (requested !== undefined && !isAutomationStudioDeepSeekModel(requested)) throw new Error(automationStudioDeepSeekModelRefusal(requested));
  if (requested !== undefined && keyModel !== undefined && requested !== keyModel) throw new Error("LLM model mismatch.");
  if (key.scope === "flow" && key.scopeRef !== input.flowId) throw new Error("LLM key Flow scope mismatch.");
  if (key.scope !== "global" && key.scope !== "flow") throw new Error("LLM key scope is incompatible.");
  return requested ?? keyModel ?? AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL;
}

export function validateRevealedKey(key: { id: string; enabled: boolean; kind: string; provider?: string | undefined; scope: string; scopeRef?: string | undefined; updatedAtMs: number; metadata?: Record<string, unknown> | undefined }, expected: { keyId: string; provider: string; model: string; flowId: string; keyUpdatedAtMs?: number }): void {
  if (key.id !== expected.keyId || !key.enabled || key.kind !== "llm" || (expected.keyUpdatedAtMs !== undefined && key.updatedAtMs !== expected.keyUpdatedAtMs)) throw new Error("LLM key changed during grant authorization.");
  validateKeyCompatibility(key, { provider: expected.provider, model: expected.model, flowId: expected.flowId });
}


export function executionBinding(value: string | AutomationStudioLlmExecutionBinding, purpose: AutomationStudioLlmExecutionGrantPurpose): { executionDigest: string; settingsRevision?: number } {
  if (typeof value === "string") {
    if (purpose !== "diagnosis_only") throw new Error(`${purpose} requires an exact Flow settings revision.`);
    return { executionDigest: requiredDigest(value) };
  }
  const executionDigest = requiredDigest(value.executionDigest);
  if (!Number.isInteger(value.settingsRevision) || value.settingsRevision < 0) throw new Error("LLM Flow settings revision is invalid.");
  return { executionDigest, settingsRevision: value.settingsRevision };
}

export function roundedCost(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

/** What a completed call is charged against the run's token budget: the total
 * it reported, when the report is consistent, and never more than its worst
 * case -- the provider already refuses a reply above its limits, and charging
 * past the worst case would make the grant stricter than the run's ledger. A
 * missing or inconsistent report is charged the worst case. */
export function reportedTotalTokens(result: unknown, worstCaseTokens: number): number {
  const usage = typeof result === "object" && result !== null ? (result as { usage?: unknown }).usage : undefined;
  if (typeof usage !== "object" || usage === null) return worstCaseTokens;
  const { inputTokens, outputTokens, totalTokens } = usage as { inputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown };
  const whole = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
  if (!whole(inputTokens) || !whole(outputTokens) || !whole(totalTokens) || totalTokens !== inputTokens + outputTokens) return worstCaseTokens;
  return Math.min(totalTokens, worstCaseTokens);
}

export function requiredDigest(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error("Flow execution dependency digest is required.");
  return clean;
}
export function required(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error("Project and Flow are required.");
  return clean;
}
