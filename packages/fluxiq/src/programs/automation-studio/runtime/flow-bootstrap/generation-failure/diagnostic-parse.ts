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
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { parseAutomationStudioFlowBootstrapEvidenceSteps } from "../evidence-loop-steps.ts";
import { FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE } from "./codes.ts";
import { DIAGNOSTIC_ISSUE_CODE, MAX_DIAGNOSTIC_ISSUE_CODES, type AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";
import { automationStudioFlowBootstrapFailureState, automationStudioFlowBootstrapProviderStatus } from "./failure-state.ts";

export function parseAutomationStudioFlowBootstrapFailureDiagnostic(
  value: unknown
): AutomationStudioFlowBootstrapFailureDiagnostic | null {
  if (!isRecord(value) || !hasExactFields(value, ["code", "stage", "retryable", "providerInvocation", "providerResponse", "accounting", "evidenceLoop", "issueCodes", "permissionRequest"])) return null;
  if (typeof value.code !== "string") return null;
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
  return {
    code: value.code,
    stage,
    retryable: value.retryable,
    providerInvocation: value.providerInvocation,
    providerResponse: value.providerResponse,
    ...(accounting ? { accounting } : {}),
    ...(evidenceLoop ? { evidenceLoop } : {}),
    ...(value.issueCodes !== undefined ? { issueCodes: [...value.issueCodes as string[]] } : {}),
    ...(permissionRequest ? { permissionRequest } : {})
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
const EVIDENCE_LOOP_MAX_TRACE_STEPS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1;
/** The published steps are one per trace row, and one decision may write two of them. */
const EVIDENCE_LOOP_MAX_TRACE_ROWS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * 2 + 1;

function parseEvidenceLoopCounts(value: unknown): NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasExactFields(value, ["iterationCount", "decisionCount", "toolCallCount", "evidenceBytes", "steps"])) return null;
  if (!boundedInteger(value.iterationCount, EVIDENCE_LOOP_MAX_ITERATIONS) || !boundedInteger(value.decisionCount, EVIDENCE_LOOP_MAX_TRACE_STEPS)
    || !boundedInteger(value.toolCallCount, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls)
    || !boundedInteger(value.evidenceBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes)) return null;
  // The steps are parsed by the module that declares them. A step's shape and
  // the allow-list that parses it must move together -- a field the shape gains
  // and the list does not takes the whole diagnostic down rather than arriving
  // short -- and keeping them in one file is what makes that a single edit
  // instead of a convention.
  let steps: NonNullable<NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["evidenceLoop"]>["steps"]> | undefined;
  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps) || value.steps.length > EVIDENCE_LOOP_MAX_TRACE_ROWS) return null;
    const parsed = parseAutomationStudioFlowBootstrapEvidenceSteps(value.steps);
    if (!parsed) return null;
    steps = parsed;
  }
  return {
    iterationCount: value.iterationCount as number,
    decisionCount: value.decisionCount as number,
    toolCallCount: value.toolCallCount as number,
    evidenceBytes: value.evidenceBytes as number,
    ...(steps ? { steps } : {})
  };
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
