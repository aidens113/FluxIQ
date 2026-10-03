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

import { automationStudioLocatorShapedText } from "./locator-text.ts";
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
  if (context.recoveryContext !== undefined && !sendableRecoveryContext(request, deniedKeys)) return "llm.provider_recovery_context_invalid";
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

/**
 * The tasks whose request may carry the packets an exploration returned.
 *
 * This named the patch alone, which made the exploration the patch's errand and
 * nothing else's. The loop now re-plans after looking -- a second
 * `runtime_diagnosis`, at the `plan` stage, whose entire purpose is to weigh the
 * model's earlier claim about the page against the page it has now seen -- and a
 * re-plan shown none of the explored packets would be the first diagnosis asked
 * again, at the same price, with the same answer. `explored-evidence.ts` holds
 * the same set on the way in, and a test pins the two together.
 */
const EXPLORATION_EVIDENCE_TASK_KINDS: ReadonlySet<AutomationStudioLlmTaskRequest["taskKind"]> = new Set<AutomationStudioLlmTaskRequest["taskKind"]>([
  "runtime_patch",
  "runtime_diagnosis"
]);

/** A slot the packet builder could have produced under the declaration, free of credentials. */
function sendableExplorationEvidence(request: AutomationStudioLlmTaskRequest, deniedKeys: readonly string[] | undefined): boolean {
  const slot = request.context.explorationEvidence;
  return deniedKeys !== undefined && EXPLORATION_EVIDENCE_TASK_KINDS.has(request.taskKind)
    && isAutomationStudioLlmExploredEvidenceSlot(slot, deniedKeys) && credentialFree(slot);
}

/**
 * A result summary that serializes, free of the declared keys where the
 * domain's own values sit, and free of credentials anywhere. There is no size
 * bound: the summary carries every row the run stored.
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
 *
 * A build's test (`buildTest`, t195-w25) carries the domain's evidence in two
 * more places: what the test observed of each step, where the declared keys are
 * looked for, and each step's own words. No string anywhere in it may be shaped
 * like a locator. The builder (`result-verification/build-test/summary.ts`)
 * drops both before this sees them, so a refusal here means the two drifted.
 */
function sendableResultSummary(request: AutomationStudioLlmTaskRequest, deniedKeys: readonly string[] | undefined): boolean {
  const summary = request.context.resultSummary;
  if (!deniedKeys || summary === undefined || !RESULT_SUMMARY_TASK_KINDS.has(request.taskKind)) return false;
  if (!credentialFree(summary)) return false;
  const sampled = summary.recordSets.flatMap((set) => set.sampleRows ?? []);
  if (screenAutomationStudioLlmEvidence(sampled, deniedKeys).deniedKey) return false;
  if (summary.buildTest !== undefined && !sendableBuildTest(summary.buildTest, deniedKeys)) return false;
  return Number.isFinite(serializedBytes(summary));
}

/**
 * A build's test free of the declared keys in what it observed, and of locators
 * anywhere. Since t252 the domain's values sit in two more places, both held to
 * the declared keys: each pass of a repeated step (what it observed, and the
 * row label it names), and each Flow input's test value (`inputs`); an input's
 * name and the pass's own fields are Core's envelope.
 */
function sendableBuildTest(buildTest: NonNullable<NonNullable<AutomationStudioLlmTaskRequest["context"]["resultSummary"]>["buildTest"]>, deniedKeys: readonly string[]): boolean {
  const steps: unknown[] = Array.isArray(buildTest.steps) ? buildTest.steps : [];
  const observed = steps.map((step) => (isRecord(step) ? step.observed : undefined));
  const passes = steps.flatMap((step) => (isRecord(step) && Array.isArray(step.passes) ? step.passes : []))
    .map((pass: unknown) => (isRecord(pass) ? [pass.observed, pass.row] : undefined));
  const inputs: unknown = (buildTest as { inputs?: unknown }).inputs;
  const tested = Array.isArray(inputs) ? inputs.map((input: unknown) => (isRecord(input) ? input.test : undefined)) : [];
  if (screenAutomationStudioLlmEvidence([observed, passes, tested], deniedKeys).deniedKey) return false;
  return !locatorShapedAnywhere(buildTest);
}

/** The tasks whose request may carry a recovery context. The packet builder's own rule, restated on the way out. */
const RECOVERY_CONTEXT_TASK_KINDS: ReadonlySet<AutomationStudioLlmTaskRequest["taskKind"]> = new Set<AutomationStudioLlmTaskRequest["taskKind"]>([
  "runtime_diagnosis",
  "runtime_patch"
]);

/**
 * A recovery context free of the domain's declared keys, of credentials, and of
 * anything shaped like a way to address an element.
 *
 * It was not checked here at all, and for most of its life that was defensible:
 * every section was Core's own field names over Core's own values. It is not
 * any more. `step_parameters` projects the Flow's authored parameters and the
 * output port ids a domain minted, and `flow_graph` carries a router's rules
 * with the conditions the build wrote -- three places where a domain's or a
 * person's string now travels in this slot.
 *
 * The locator check is the contract between this and the builder rather than a
 * second opinion. `buildAutomationStudioRuntimeRecoveryContext` puts every
 * section through `automationStudioWithoutLocators`, so a locator shape here
 * means the builder and this check have drifted, and the call is refused rather
 * than sent -- which is what the result-summary slot had to learn the hard way,
 * when the builder started filling a slot this refused and killed every repair
 * call before it left the process.
 *
 * Unlike the evidence slots, an absent declaration is not itself a refusal: a
 * deployment with no bound domain has always had a recovery context and has
 * nothing to declare. What an absent declaration does do is upstream, in the
 * builder, where it withholds `step_parameters` outright.
 */
function sendableRecoveryContext(request: AutomationStudioLlmTaskRequest, deniedKeys: readonly string[] | undefined): boolean {
  const context = request.context.recoveryContext;
  if (context === undefined || !RECOVERY_CONTEXT_TASK_KINDS.has(request.taskKind)) return false;
  if (!credentialFree(context)) return false;
  if (deniedKeys && screenAutomationStudioLlmEvidence(context.sections, deniedKeys).deniedKey) return false;
  return !locatorShapedAnywhere(context.sections);
}

/** Whether any string anywhere in `value` still trips the locator screen. */
function locatorShapedAnywhere(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "string") return automationStudioLocatorShapedText(value);
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => locatorShapedAnywhere(item, seen));
  return Object.entries(value).some(([key, item]) => automationStudioLocatorShapedText(key) || locatorShapedAnywhere(item, seen));
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
