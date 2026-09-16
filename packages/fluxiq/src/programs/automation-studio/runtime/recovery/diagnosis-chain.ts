import type { AutomationStudioLlmTaskResult } from "../llm/index.ts";

export type AutomationStudioRuntimePatchRequestDecision = { request: boolean; reason: string };

/**
 * Whether the second, billed `runtime_patch` call should happen.
 *
 * Diagnosis and patch used to be two independent calls: the patch ran whenever
 * a provider existed, so a failed or malformed diagnosis still billed a second
 * call. The patch is a continuation of the diagnosis, so it runs only when the
 * diagnosis succeeded and actually returned a diagnosis.
 */
export function decideAutomationStudioRuntimePatchRequest(diagnosis: AutomationStudioLlmTaskResult | undefined): AutomationStudioRuntimePatchRequestDecision {
  if (!diagnosis) return { request: false, reason: "No diagnosis was requested." };
  if (!diagnosis.ok) return { request: false, reason: "The diagnosis call failed, so there is nothing to patch from." };
  if (diagnosis.response?.kind !== "diagnosis") {
    return { request: false, reason: `The diagnosis returned ${diagnosis.response?.kind ?? "no structured response"}, so no patch was requested.` };
  }
  return { request: true, reason: "The diagnosis succeeded and calls for a runtime patch." };
}
