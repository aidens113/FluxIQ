// A published diagnostic read back. `null` for anything Core did not write, so a
// record that has been edited, truncated or invented cannot be republished as
// Core's own account of a failure.
//
// Every field is held to the bound it was published under, and the state fields
// are checked against `automationStudioFlowBootstrapFailureState` -- the same
// function the producers write them from, so a diagnostic Core produced always
// reads back and one claiming a state its code does not have never does.
import { parseAutomationStudioActionPermissionRequest } from "../../action-permissions/index.ts";
// Refusal records are owned by a neutral runtime seam: Flow Bootstrap persists
// them and the LLM adapter produces them, so neither feature barrel may own the
// value without closing an initialization cycle through the other.
import { parseAutomationStudioLlmProviderRefusal, type AutomationStudioLlmProviderRefusal } from "../../provider-refusal/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { parseAutomationStudioFlowBootstrapEvidenceSteps } from "../evidence-loop-steps.ts";
import { automationStudioFlowBootstrapLargestSizeLimits } from "../plan/index.ts";
import { parseAutomationStudioFlowBootstrapBuildEnding } from "./build-ending.ts";
import { parseAutomationStudioFlowBootstrapCandidateKept } from "./candidate-kept.ts";
import { automationStudioFlowBootstrapRefusedSteps } from "./refused-steps.ts";
import { FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE } from "./codes.ts";
import type { AutomationStudioLlmProviderThrow, AutomationStudioLlmProviderThrowWithheld } from "../../llm/index.ts";
import { DIAGNOSTIC_ISSUE_CODE, MAX_DIAGNOSTIC_ISSUE_CODES, type AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";
import { automationStudioFlowBootstrapFailureState, automationStudioFlowBootstrapProviderStatus } from "./failure-state.ts";

export function parseAutomationStudioFlowBootstrapFailureDiagnostic(
  value: unknown
): AutomationStudioFlowBootstrapFailureDiagnostic | null {
  if (!isRecord(value) || !hasExactFields(value, ["code", "stage", "retryable", "providerInvocation", "providerResponse", "accounting", "evidenceLoop", "issueCodes", "permissionRequest", "providerThrow", "ending", "candidate", "refusedSteps", "totalProviderCallCount"])) return null;
  if (typeof value.code !== "string") return null;
  if (value.totalProviderCallCount !== undefined && (!Number.isSafeInteger(value.totalProviderCallCount) || (value.totalProviderCallCount as number) < 0)) return null;
  // The stage a code belongs to, which is also the only stage it may claim. A
  // code the taxonomy does not have belongs to none, and is not Core's.
  const stage = FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE.get(value.code);
  if (!stage || value.stage !== stage) return null;
  if (value.retryable !== true && value.retryable !== false) return null;
  if (value.providerInvocation !== "not_attempted" && value.providerInvocation !== "attempted" && value.providerInvocation !== "unknown") return null;
  if (value.providerResponse !== "not_received" && value.providerResponse !== "received" && value.providerResponse !== "unknown") return null;
  // The state is computed, not tabulated here: this reads the same function the
  // producers write from, which is what makes "every diagnostic Core produces
  // parses back" a property of one table rather than of two lists agreeing.
  const state = automationStudioFlowBootstrapFailureState(value.code, stage, providerStatusFromAccounting(value.accounting));
  if (value.retryable !== state.retryable || !state.acceptedProviderInvocations.includes(value.providerInvocation)
    || value.providerResponse !== state.providerResponse) return null;
  if ((value.providerResponse === "received" && value.providerInvocation !== "attempted")
    || (value.providerInvocation === "not_attempted" && value.providerResponse !== "not_received")) return null;
  if (state.accounting === "required" ? value.accounting === undefined : state.accounting === "absent" && value.accounting !== undefined) return null;
  const accounting = parseAccounting(value.accounting);
  if (value.accounting !== undefined && !accounting) return null;
  const evidenceLoop = parseEvidenceLoopCounts(value.evidenceLoop);
  if (value.evidenceLoop !== undefined && !evidenceLoop) return null;
  if (value.issueCodes !== undefined && (!Array.isArray(value.issueCodes) || !value.issueCodes.length
    || value.issueCodes.length > MAX_DIAGNOSTIC_ISSUE_CODES
    || !value.issueCodes.every((code) => typeof code === "string" && DIAGNOSTIC_ISSUE_CODE.test(code)))) return null;
  const permissionRequest = value.permissionRequest === undefined ? undefined : parseAutomationStudioActionPermissionRequest(value.permissionRequest);
  if (permissionRequest === null || (state.permissionRequest === "required") !== (permissionRequest !== undefined)) return null;
  // Only the one code that means "something threw and nothing named it" may
  // say what threw: every other code already names its fault.
  const providerThrow = parseAutomationStudioFlowBootstrapProviderThrow(value.providerThrow);
  if (providerThrow === null || (providerThrow !== undefined && value.code !== PROVIDER_THROW_CODE)) return null;
  // Required beside its two codes and refused beside any other, by the one parse its producer uses.
  const ending = parseAutomationStudioFlowBootstrapBuildEnding(value.ending, value.code);
  if (ending === null || (state.ending === "required") !== (ending !== undefined)) return null;
  const candidate = parseAutomationStudioFlowBootstrapCandidateKept(value.candidate);
  if (candidate === null) return null;
  // The refused steps' own words stand only beside the no-progress ending they explain.
  const refusedSteps = automationStudioFlowBootstrapRefusedSteps.parse(value.refusedSteps);
  if (refusedSteps === null || (refusedSteps !== undefined && value.code !== REFUSED_STEPS_CODE)) return null;
  return {
    ...(value.totalProviderCallCount === undefined ? {} : { totalProviderCallCount: value.totalProviderCallCount as number }),
    code: value.code,
    stage,
    retryable: value.retryable,
    providerInvocation: value.providerInvocation,
    providerResponse: value.providerResponse,
    ...(accounting ? { accounting } : {}),
    ...(evidenceLoop ? { evidenceLoop } : {}),
    ...(value.issueCodes !== undefined ? { issueCodes: [...value.issueCodes as string[]] } : {}),
    ...(permissionRequest ? { permissionRequest } : {}),
    ...(providerThrow ? { providerThrow } : {}),
    ...(ending ? { ending } : {}),
    ...(candidate ? { candidate } : {}),
    ...(refusedSteps ? { refusedSteps } : {})
  };
}

/** The code stored refused steps may stand beside. */
const REFUSED_STEPS_CODE = "flow_bootstrap.evidence_repeat_without_progress";
/** The code a stored provider throw may stand beside. */
const PROVIDER_THROW_CODE = "flow_bootstrap.provider_transport_unknown";
/**
 * The bounds a stored throw is held to, written out here like every other bound
 * in this file (`runtime/llm/throw-account/` reads the throw and `runtime/llm/harness/throw-screen.ts` screens it). The `satisfies`
 * keeps the vocabulary a subset of the producer's type; a test holds the two
 * lists equal.
 */
const PROVIDER_THROW_WITHHELD = [
  "message_credential_shaped",
  "message_url_query_shaped",
  "message_payload_shaped",
  "message_locator_shaped",
  "message_truncated",
  "throw_unreadable"
] as const satisfies readonly AutomationStudioLlmProviderThrowWithheld[];
const PROVIDER_THROW_MESSAGE_LENGTH = 240;
const PROVIDER_THROW_CODE_FIELDS = ["errorClass", "errorCode", "causeClass", "causeCode"] as const;

/**
 * A stored account of an untyped provider throw, read back: `undefined` when
 * there is none, `null` when what is there is not one Core wrote.
 *
 * Bounds only, like the refusal record's parse. The credential, header, query
 * and locator screens ran in the harness, against the whole text as thrown;
 * this cannot repeat them and does not pretend to. What it holds is the shape:
 * code-shaped classes and codes, a message within its bound on one line, and a
 * `withheld` list drawn from the producer's vocabulary without repeats. The
 * harness projection stores only what this returns, so a throw Core stores is a
 * throw Core reads back.
 */
export function parseAutomationStudioFlowBootstrapProviderThrow(value: unknown): AutomationStudioLlmProviderThrow | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasExactFields(value, [...PROVIDER_THROW_CODE_FIELDS, "message", "withheld"]) || !Object.keys(value).length) return null;
  for (const field of PROVIDER_THROW_CODE_FIELDS) {
    if (value[field] !== undefined && (typeof value[field] !== "string" || !DIAGNOSTIC_ISSUE_CODE.test(value[field]))) return null;
  }
  if (value.message !== undefined && (typeof value.message !== "string" || value.message.length === 0
    || value.message.length > PROVIDER_THROW_MESSAGE_LENGTH || /[\u0000-\u001f\u007f]/u.test(value.message))) return null;
  const withheldVocabulary: readonly string[] = PROVIDER_THROW_WITHHELD;
  if (value.withheld !== undefined && (!Array.isArray(value.withheld) || !value.withheld.length
    || value.withheld.length > PROVIDER_THROW_WITHHELD.length || new Set(value.withheld).size !== value.withheld.length
    || !value.withheld.every((reason) => typeof reason === "string" && withheldVocabulary.includes(reason)))) return null;
  return {
    ...(value.errorClass !== undefined ? { errorClass: value.errorClass as string } : {}),
    ...(value.errorCode !== undefined ? { errorCode: value.errorCode as string } : {}),
    ...(value.causeClass !== undefined ? { causeClass: value.causeClass as string } : {}),
    ...(value.causeCode !== undefined ? { causeCode: value.causeCode as string } : {}),
    ...(value.message !== undefined ? { message: value.message } : {}),
    ...(value.withheld !== undefined ? { withheld: [...value.withheld as AutomationStudioLlmProviderThrowWithheld[]] } : {})
  };
}

function providerStatusFromAccounting(value: unknown): number | undefined {
  return isRecord(value) ? automationStudioFlowBootstrapProviderStatus(value.providerStatus) : undefined;
}

function parseAccounting(value: unknown): NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasExactFields(value, ["requestId", "estimatedInputTokens", "provider", "model", "providerStatus", "providerRefusal", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"])) return null;
  if (typeof value.requestId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(value.requestId)) return null;
  // A build's totals, not one request's: an iterating build adds up every call.
  if (!boundedInteger(value.estimatedInputTokens, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS)) return null;
  if (value.provider !== undefined && !boundedLabel(value.provider)) return null;
  if (value.model !== undefined && !boundedLabel(value.model)) return null;
  if (value.providerStatus !== undefined && automationStudioFlowBootstrapProviderStatus(value.providerStatus) === undefined) return null;
  const providerRefusal = storedProviderRefusal(value.providerRefusal);
  if (value.providerRefusal !== undefined && !providerRefusal) return null;
  for (const field of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (value[field] !== undefined && !boundedInteger(value[field], AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS)) return null;
  }
  if (value.estimatedCostUsd !== undefined && (typeof value.estimatedCostUsd !== "number" || !Number.isFinite(value.estimatedCostUsd) || value.estimatedCostUsd < 0 || value.estimatedCostUsd > 10)) return null;
  return {
    requestId: value.requestId,
    estimatedInputTokens: value.estimatedInputTokens as number,
    ...(value.provider !== undefined ? { provider: value.provider as string } : {}),
    ...(value.model !== undefined ? { model: value.model as string } : {}),
    ...(value.providerStatus !== undefined ? { providerStatus: value.providerStatus as number } : {}),
    ...(providerRefusal ? { providerRefusal } : {}),
    ...(value.inputTokens !== undefined ? { inputTokens: value.inputTokens as number } : {}),
    ...(value.outputTokens !== undefined ? { outputTokens: value.outputTokens as number } : {}),
    ...(value.totalTokens !== undefined ? { totalTokens: value.totalTokens as number } : {}),
    ...(value.estimatedCostUsd !== undefined ? { estimatedCostUsd: value.estimatedCostUsd } : {})
  };
}

/**
 * The refusal a stored accounting carries, or nothing.
 *
 * **Present and unreadable refuses the whole record, rather than dropping the
 * field.** Every other field here works that way -- a provider label with a
 * newline in it, a status outside 400-599, a cost over ten dollars each refuse
 * the accounting -- because this parse answers one question: is this Core's own
 * account of a failure, as Core published it. A refusal record that has been
 * edited, truncated or invented is evidence the record is not, and a reader
 * cannot tell a silently dropped refusal from a provider that said nothing,
 * which is the exact distinction the `withheld` vocabulary exists to keep.
 *
 * That would be an unsafe rule if a producer could write a record this refuses,
 * because refusing the accounting refuses the diagnostic and an erased
 * diagnostic is how a named failure became one unreadable word. It cannot:
 * `flowBootstrapHarnessFailure` stores only what this same function returns.
 *
 * A JSON string is refused too, and deliberately: the record's home here is the
 * typed object, and a string in this slot is the older `responseBody` carriage
 * (`deepseek/refusal.ts`) that Core no longer writes. `parseAutomationStudioLlmProviderRefusal`
 * would read one, but the result would not be the value that was stored, so a
 * record holding one does not round-trip and is not Core's.
 *
 * **Two levels, and the difference matters.** What is refused is a value that is
 * not a refusal: no status, an unreadable account of its own omissions, anything
 * but a record. A *field* the central bounds will not carry is dropped instead
 * and named in `withheld` -- a request shape holding prose arrives as no shape
 * plus `request_unpublishable` -- because that is not silence: the record says
 * what it left out, which is the whole point of the vocabulary.
 */
function storedProviderRefusal(value: unknown): AutomationStudioLlmProviderRefusal | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  return parseAutomationStudioLlmProviderRefusal(value);
}

/**
 * The most a loop can record: its ceiling on decisions, plus the one
 * observation it may make before the first. These were sixteen, the loop's old
 * ceiling, and were left behind when it rose -- so a diagnostic from a longer
 * exploration failed to parse, and its named reason was replaced by a generic
 * transport failure.
 */
const EVIDENCE_LOOP_MAX_ITERATIONS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations;
/**
 * A build that could not finish publishes every live round it ran, the
 * exploration and each repair or exploring-again, not the last round's alone
 * (`../unfinished-build/phases.ts`, t214): its counts and its rows are bounded
 * at one round's ceiling for each round a build may run. `exhausted` stays one
 * round's, since it says which allowance the last round ran out of.
 *
 * Read when a record is parsed, never at module load: this module is reached
 * inside the `loop-limits` -> `llm` -> `flow-bootstrap` import cycle, where a
 * constant taken at load can still be unset and turn every bound into `NaN`,
 * which refuses every diagnostic.
 */
function evidenceLoopBuildBounds(): { iterations: number; decisions: number; toolCalls: number; rows: number } {
  const rounds = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS;
  const { maxIterations, maxToolCalls } = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS;
  return {
    iterations: maxIterations * rounds,
    // Decisions plus one opening observation, for each round.
    decisions: (maxIterations + 1) * rounds,
    toolCalls: maxToolCalls * rounds,
    // The published steps are one per trace row, and one decision may write two of them.
    rows: (maxIterations * 2 + 1) * rounds
  };
}

type EvidenceLoopExhausted = NonNullable<NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]>["exhausted"]>;
/**
 * Which allowance an exhausted loop ran out of, in the loop's own closed set
 * (`runtime/llm/evidence-loop/exhaustion.ts`). Written out here like every other
 * bound in this file: a reader must be able to decide whether a stored record is
 * Core's without the producer's value in hand.
 */
const EVIDENCE_LOOP_EXHAUSTED_BOUNDS: readonly string[] = ["iterations", "budget", "tool_calls"];
const EVIDENCE_LOOP_EXHAUSTED_FIELDS = ["bound", "maxIterations", "iterations", "draftSteps", "proposableSteps", "completionAttempts", "budgetBound"];
/** Which of the budget's bounds ran out, in `runtime/llm/loop-budget.ts`'s closed set; only beside `bound: "budget"`. */
const EVIDENCE_LOOP_BUDGET_BOUNDS: readonly string[] = ["iterations", "tokens", "cost", "duration", "calls"];
/**
 * The most draft steps an exhausted record may claim: a seeded extend build
 * keeps a whole supported Flow and may append one step in every iteration.
 *
 * Bounded by the Flow size setting's largest value rather than one Flow's: a
 * stored diagnostic is read back with no Flow in hand, and one written while
 * the Flow's setting was higher must still parse after it is lowered.
 */
const EVIDENCE_LOOP_MAX_DRAFT_STEPS = automationStudioFlowBootstrapLargestSizeLimits().maxTotalNodes + AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1;

/**
 * What the loop ran out of, read back, or `null` for anything that is not that.
 *
 * All-or-nothing, like every other member of this record: a malformed exhaustion
 * refuses the diagnostic rather than arriving short. "The loop ran out of turns,
 * and here is how close it got" is precisely the claim this field exists to make
 * checkable, and a half-read one would be a worse account than none.
 */
function parseEvidenceLoopExhausted(value: unknown): EvidenceLoopExhausted | null {
  if (!isRecord(value) || !hasExactFields(value, EVIDENCE_LOOP_EXHAUSTED_FIELDS)
    || typeof value.bound !== "string" || !EVIDENCE_LOOP_EXHAUSTED_BOUNDS.includes(value.bound)
    || !boundedInteger(value.maxIterations, EVIDENCE_LOOP_MAX_ITERATIONS)
    || !boundedInteger(value.iterations, EVIDENCE_LOOP_MAX_ITERATIONS)
    || !boundedInteger(value.draftSteps, EVIDENCE_LOOP_MAX_DRAFT_STEPS)
    || !boundedInteger(value.proposableSteps, value.draftSteps as number)
    || !boundedInteger(value.completionAttempts, EVIDENCE_LOOP_MAX_ITERATIONS)
    || (value.budgetBound !== undefined && (value.bound !== "budget" || typeof value.budgetBound !== "string" || !EVIDENCE_LOOP_BUDGET_BOUNDS.includes(value.budgetBound)))) return null;
  return {
    bound: value.bound as EvidenceLoopExhausted["bound"],
    maxIterations: value.maxIterations as number,
    iterations: value.iterations as number,
    draftSteps: value.draftSteps as number,
    proposableSteps: value.proposableSteps as number,
    completionAttempts: value.completionAttempts as number,
    ...(value.budgetBound !== undefined ? { budgetBound: value.budgetBound as NonNullable<EvidenceLoopExhausted["budgetBound"]> } : {})
  };
}

function parseEvidenceLoopCounts(value: unknown): NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasExactFields(value, ["iterationCount", "decisionCount", "toolCallCount", "evidenceBytes", "steps", "exhausted", "incompleteDraft"])) return null;
  const bounds = evidenceLoopBuildBounds();
  if (!boundedInteger(value.iterationCount, bounds.iterations) || !boundedInteger(value.decisionCount, bounds.decisions)
    || !boundedInteger(value.toolCallCount, bounds.toolCalls)
    || !boundedInteger(value.evidenceBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes)) return null;
  // The steps are parsed by the module that declares them. A step's shape and
  // the allow-list that parses it must move together -- a field the shape gains
  // and the list does not takes the whole diagnostic down rather than arriving
  // short -- and keeping them in one file is what makes that a single edit
  // instead of a convention.
  let steps: NonNullable<NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]>["steps"]> | undefined;
  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps) || value.steps.length > bounds.rows) return null;
    const parsed = parseAutomationStudioFlowBootstrapEvidenceSteps(value.steps);
    if (!parsed) return null;
    steps = parsed;
  }
  const exhausted = value.exhausted === undefined ? undefined : parseEvidenceLoopExhausted(value.exhausted);
  if (exhausted === null) return null;
  const incompleteDraft = value.incompleteDraft === undefined ? undefined : parseIncompleteDraftPointer(value.incompleteDraft);
  if (incompleteDraft === null) return null;
  return {
    iterationCount: value.iterationCount as number,
    decisionCount: value.decisionCount as number,
    toolCallCount: value.toolCallCount as number,
    evidenceBytes: value.evidenceBytes as number,
    ...(steps ? { steps } : {}),
    ...(exhausted ? { exhausted } : {}),
    ...(incompleteDraft ? { incompleteDraft } : {})
  };
}

/**
 * The pointer to a kept incomplete draft: a revision from 1 and at least one
 * step, since a draft with no proposable step is never kept.
 */
function parseIncompleteDraftPointer(value: unknown): { revision: number; steps: number } | null {
  if (!isRecord(value) || !hasExactFields(value, ["revision", "steps"])
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1
    || !boundedInteger(value.steps, EVIDENCE_LOOP_MAX_DRAFT_STEPS) || value.steps === 0) return null;
  return { revision: value.revision as number, steps: value.steps as number };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, allowed: string[]): boolean {
  const fields = new Set(allowed);
  return Object.keys(value).every((key) => fields.has(key));
}

function boundedInteger(value: unknown, maximum: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function boundedLabel(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\r\n]/.test(value);
}
