// The check a provider runs on every evidence-bearing slot of a request before
// sending it.
//
// The DeepSeek adapter used to re-check the failure evidence alone, and with
// Core's structural bounds only, because the domain's declared keys never
// travelled with a request. Explored packets were added to runtime patch
// requests without any pre-send check, and an evidence loop's gathered results
// had only a size bound. Each slot is now held, before anything leaves the
// process, to three things: the rule the packet builder applied when it built
// the slot, the bound domain's declared keys (which a request built by the
// harness now carries, and which are never sent), and Core's credential
// shapes. A slot that carries evidence on a request that declares no keys is
// refused: an absent declaration means nobody said, never "deny nothing".
//
// Declared keys are matched against what the domain supplied, never against
// the envelope Core wraps it in, so a domain's list cannot collide with Core's
// own field names. Credential shapes are looked for everywhere.
//
// Each slot refuses with its own pre-flight code and a code only. The refused
// value is never read into an error.

import type { AutomationStudioLlmProviderPreflightErrorCode } from "../provider-contract.ts";
import { screenAutomationStudioLlmEvidence } from "./evidence-screen.ts";
import { isAutomationStudioLlmExploredEvidenceSlot } from "./explored-evidence.ts";
import { sanitizeAutomationStudioLlmFailureEvidence } from "./failure-evidence.ts";
import { isRecord } from "./json-bounds.ts";
import type { AutomationStudioLlmTaskRequest } from "./task-request.ts";

/**
 * The pre-flight code of the first evidence slot in `request` that may not be
 * sent, or `undefined` when every slot it carries may be. Slots are checked in
 * a fixed order: failure evidence, explored packets, then the evidence loop's
 * gathered results. An evidence loop is checked on whatever task carries it,
 * because a provider may send a runtime task's context whole.
 */
export function automationStudioLlmRequestEvidenceRefusal(request: AutomationStudioLlmTaskRequest): AutomationStudioLlmProviderPreflightErrorCode | undefined {
  const context = request.context;
  const deniedKeys = declaredKeys(request.deniedEvidenceKeys);
  if (context.failureEvidence !== undefined && !sendableFailureEvidence(request, deniedKeys)) return "llm.provider_failure_evidence_invalid";
  if (context.explorationEvidence !== undefined && !sendableExplorationEvidence(request, deniedKeys)) return "llm.provider_exploration_evidence_invalid";
  const gathered: unknown = context.evidenceLoop?.evidence;
  if (Array.isArray(gathered) && gathered.length > 0 && !sendableGatheredEvidence(gathered, deniedKeys)) return "llm.provider_evidence_loop_context_invalid";
  return undefined;
}

function declaredKeys(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((key) => typeof key === "string") ? value : undefined;
}

/** Re-sanitized under the declaration to exactly itself, and free of credentials. */
function sendableFailureEvidence(request: AutomationStudioLlmTaskRequest, deniedKeys: readonly string[] | undefined): boolean {
  const evidence = request.context.failureEvidence;
  if (!deniedKeys || evidence === undefined || (request.taskKind !== "runtime_diagnosis" && request.taskKind !== "runtime_patch")) return false;
  let resanitized: string;
  try {
    resanitized = JSON.stringify(sanitizeAutomationStudioLlmFailureEvidence(request.taskKind, evidence, deniedKeys));
  } catch {
    // The sanitizer's refusal is itself the finding. Its message is not kept,
    // so nothing it read about the evidence travels any further.
    return false;
  }
  return resanitized === JSON.stringify(evidence) && credentialFree(evidence);
}

/** A slot the packet builder could have produced under the declaration, free of credentials. */
function sendableExplorationEvidence(request: AutomationStudioLlmTaskRequest, deniedKeys: readonly string[] | undefined): boolean {
  const slot = request.context.explorationEvidence;
  return deniedKeys !== undefined && request.taskKind === "runtime_patch"
    && isAutomationStudioLlmExploredEvidenceSlot(slot, deniedKeys) && credentialFree(slot);
}

/** Each gathered value free of the declared keys, and each entry free of credentials. */
function sendableGatheredEvidence(gathered: readonly unknown[], deniedKeys: readonly string[] | undefined): boolean {
  if (!deniedKeys) return false;
  return gathered.every((entry) => credentialFree(entry)
    && !screenAutomationStudioLlmEvidence(isRecord(entry) ? entry.value : entry, deniedKeys).deniedKey);
}

function credentialFree(value: unknown): boolean {
  return !screenAutomationStudioLlmEvidence(value, []).secretShaped;
}
