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

import { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS } from "../../loop-limits/index.ts";
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
  if (context.resultSummary !== undefined && !sendableResultSummary(request, deniedKeys)) return "llm.provider_result_summary_invalid";
  const gathered: unknown = context.evidenceLoop?.evidence;
  if (Array.isArray(gathered) && gathered.length > 0 && !sendableGatheredEvidence(gathered, deniedKeys)) return "llm.provider_evidence_loop_context_invalid";
  return undefined;
}

/** The tasks whose request may carry a finished run's result summary. Mirrors the packet builder's set; a test pins the two together. */
const RESULT_SUMMARY_TASK_KINDS: ReadonlySet<AutomationStudioLlmTaskRequest["taskKind"]> = new Set<AutomationStudioLlmTaskRequest["taskKind"]>([
  "loop_verification",
  "runtime_diagnosis",
  "runtime_patch"
]);

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

/**
 * A result summary small enough to send, free of the declared keys where the
 * domain's own values sit, and free of credentials anywhere.
 *
 * The declared keys are looked for in the sampled rows and nowhere else: a
 * sampled row's keys are the record schema's field ids, which come from the
 * medium, and every other key in the summary is Core's own envelope. That is
 * the same rule the other slots follow -- a domain's list is matched against
 * what the domain supplied, never against the names Core wraps it in.
 *
 * The task kinds are the packet builder's own set. A repair entered from a
 * refuted result is shown what the run produced, so a runtime diagnosis and a
 * runtime patch carry a summary as legitimately as the verification does --
 * and while this named only the verification, the packet builder put the slot
 * on the request and this refused the call outright.
 */
function sendableResultSummary(request: AutomationStudioLlmTaskRequest, deniedKeys: readonly string[] | undefined): boolean {
  const summary = request.context.resultSummary;
  if (!deniedKeys || summary === undefined || !RESULT_SUMMARY_TASK_KINDS.has(request.taskKind)) return false;
  if (!credentialFree(summary)) return false;
  const sampled = summary.recordSets.flatMap((set) => set.sampleRows ?? []);
  if (screenAutomationStudioLlmEvidence(sampled, deniedKeys).deniedKey) return false;
  return serializedBytes(summary) <= AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxBytes;
}

function serializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
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
