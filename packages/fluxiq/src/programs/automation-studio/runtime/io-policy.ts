import {
  parseAutomationStudioFailureRecord,
  type AutomationStudioAdaptiveFailureClass,
  type AutomationStudioFailureRecord,
  type AutomationStudioFailureStage
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { IoRegistry } from "../../../io/index.ts";
import type { FluxIQRuntimeCommandStatus, RuntimeService } from "../../../runtime/index.ts";
import { normalizeAutomationStudioElementTarget, type AutomationStudioElementTarget, type PolicyAction } from "../model/index.ts";
import { createAutomationStudioElementMatcher } from "../fingerprinting/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodeTargetResolution } from "../nodes/contracts.ts";

const elementMatcher = createAutomationStudioElementMatcher();

type PolicyOutputAction = Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata">;
type ConfirmationOutcome = { ok: true } | { ok: false; error: string; cancelled: boolean };
type ElementTargetRejection = { ok: false; error: string; failure: AutomationStudioFailureRecord; resolution?: AutomationNodeTargetResolution };

/** Dispatches an output-native policy action through an importer-registered adapter. */
export async function dispatchPolicyOutput(
  io: IoRegistry,
  domainId: string | null | undefined,
  action: PolicyOutputAction,
  signal?: AbortSignal
): Promise<AutomationNodeExecutionResult> {
  const outputId = action.outputId?.trim();
  if (!outputId) return missingOutputIdResult("IO runtime");
  const output = io.getOutput(domainId, outputId);
  if (!output) return unregisteredOutputResult(outputId);
  const prepared = prepareElementTargetAction(io, domainId, action);
  if (!prepared.ok) return elementTargetRejectionResult(outputId, prepared);
  action = prepared.action;
  const confirmation = awaitConfirmation(io, domainId, action, signal);
  const result = await io.dispatchOutput({
    domainId: domainId ?? null,
    outputId,
    payload: action.parameters as JsonObject,
    metadata: compactJsonObject({ ...(action.metadata ?? {}), ...(prepared.diagnostics ? { elementTargetResolution: prepared.diagnostics } : {}) })
  });
  const confirmationResult = result.ok && confirmation ? await confirmation : null;
  const outputs: Record<string, JsonValue> = {
    outputId,
    ok: result.ok,
    ...(action.confirmationInputId ? { confirmationInputId: action.confirmationInputId, confirmation: confirmationResult?.ok ?? false } : {}),
    ...(prepared.diagnostics ? { elementTargetResolution: prepared.diagnostics } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(!confirmationResult?.ok && confirmationResult?.error ? { error: confirmationResult.error } : {}),
    ...(result.payload !== undefined ? { result: result.payload as JsonValue } : {})
  };
  if (result.ok && (!confirmationResult || confirmationResult.ok)) return { status: "success", route: "success", outputs, ...targetResolutionField(prepared.resolution) };
  return failedDispatchResult(outputs, {
    message: confirmationFailureMessage(confirmationResult) ?? result.error,
    failure: dispatchFailure(result.ok, result.status, result.failure, confirmationResult),
    resolution: prepared.resolution
  });
}

export function createIoPolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined) {
  return async (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal }): Promise<AutomationNodeExecutionResult | undefined> => {
    if (effect.type !== "policy.output.dispatch" || !effect.payload || typeof effect.payload !== "object" || Array.isArray(effect.payload)) return undefined;
    const payload = effect.payload as JsonObject;
    const action = {
      actionType: typeof payload.outputId === "string" ? payload.outputId : "",
      parameters: payload.parameters && typeof payload.parameters === "object" && !Array.isArray(payload.parameters) ? payload.parameters as JsonObject : {},
      ...(typeof payload.outputId === "string" ? { outputId: payload.outputId } : {}),
      ...(typeof payload.confirmationInputId === "string" && payload.confirmationInputId ? { confirmationInputId: payload.confirmationInputId } : {}),
      ...(typeof payload.confirmationTimeoutMs === "number" ? { confirmationTimeoutMs: payload.confirmationTimeoutMs } : {}),
      ...(payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? { metadata: payload.metadata as JsonObject } : {})
    };
    return dispatchPolicyOutput(io, domainId, action, context?.signal);
  };
}

export function createRuntimePolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined, runtime: RuntimeService) {
  return async (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal }): Promise<AutomationNodeExecutionResult | undefined> => {
    if (effect.type !== "policy.output.dispatch" || !effect.payload || typeof effect.payload !== "object" || Array.isArray(effect.payload)) return undefined;
    const payload = effect.payload as JsonObject;
    let action = policyActionFromPayload(payload);
    const outputId = action.outputId?.trim();
    if (!outputId) return missingOutputIdResult("runtime");
    if (!io.hasOutput(domainId, outputId)) return unregisteredOutputResult(outputId);
    const prepared = prepareElementTargetAction(io, domainId, action);
    if (!prepared.ok) return elementTargetRejectionResult(outputId, prepared);
    action = prepared.action;
    if (!await runtimeCanDispatchOutput(runtime, domainId, outputId)) return dispatchPolicyOutput(io, domainId, action, context?.signal);
    const confirmation = awaitConfirmation(io, domainId, action, context?.signal);
    const result = await runtime.dispatch({
      kind: "execute_action",
      domainId: domainId ?? null,
      outputId,
      actionType: outputId,
      parameters: action.parameters as JsonObject,
      ...(typeof payload.timeoutMs === "number" ? { timeoutMs: payload.timeoutMs } : {}),
      metadata: compactJsonObject({ ...(action.metadata ?? {}), ...(prepared.diagnostics ? { elementTargetResolution: prepared.diagnostics } : {}) })
    }, {
      ...(context?.signal ? { signal: context.signal } : {}),
      ...(typeof action.metadata?.clientId === "string" ? { preferredClientId: action.metadata.clientId } : {}),
      ...(typeof action.metadata?.sessionId === "string" ? { preferredSessionId: action.metadata.sessionId } : {})
    });
    const confirmationResult = result.status === "succeeded" && confirmation ? await confirmation : null;
    const outputs: Record<string, JsonValue> = {
      outputId,
      ok: result.status === "succeeded",
      runtimeCommandId: result.commandId,
      runtimeStatus: result.status,
      ...(action.confirmationInputId ? { confirmationInputId: action.confirmationInputId, confirmation: confirmationResult?.ok ?? false } : {}),
      ...(prepared.diagnostics ? { elementTargetResolution: prepared.diagnostics } : {}),
      ...(result.error ? { error: result.error } : {}),
      ...(!confirmationResult?.ok && confirmationResult?.error ? { error: confirmationResult.error } : {}),
      ...(result.payload !== undefined ? { result: result.payload as JsonValue } : {})
    };
    if (result.status === "succeeded" && (!confirmationResult || confirmationResult.ok)) return { status: "success", route: "success", outputs, ...targetResolutionField(prepared.resolution) };
    return failedDispatchResult(outputs, {
      message: confirmationFailureMessage(confirmationResult) ?? result.message ?? result.error,
      failure: dispatchFailure(result.status === "succeeded", result.status, result.failure, confirmationResult),
      resolution: prepared.resolution
    });
  };
}

function awaitConfirmation(io: IoRegistry, domainId: string | null | undefined, action: PolicyOutputAction, signal: AbortSignal | undefined): Promise<ConfirmationOutcome> | null {
  if (!action.confirmationInputId) return null;
  return io.waitForInput({ domainId: domainId ?? null, inputId: action.confirmationInputId, ...(action.confirmationTimeoutMs !== undefined ? { timeoutMs: action.confirmationTimeoutMs } : {}), ...(signal ? { signal } : {}) })
    .then((): ConfirmationOutcome => ({ ok: true }))
    .catch((error: unknown): ConfirmationOutcome => ({ ok: false, error: error instanceof Error ? error.message : "Output confirmation failed.", cancelled: signal?.aborted === true }));
}

// A valid host-reported record wins. Otherwise Core names only what its own
// structured signals prove: a timed-out or rejected command, or a dispatched
// output whose bound confirmation input never arrived. Anything else is left
// to the legacy classifier.
function dispatchFailure(dispatched: boolean, status: FluxIQRuntimeCommandStatus | undefined, reported: unknown, confirmation: ConfirmationOutcome | null): AutomationStudioFailureRecord | null {
  if (!dispatched) return parseAutomationStudioFailureRecord(reported) ?? failureForCommandStatus(status);
  if (confirmation && !confirmation.ok && !confirmation.cancelled) return coreFailure("output_not_observed", "output_confirmation.not_received", true, "confirmation");
  return null;
}

function failureForCommandStatus(status: FluxIQRuntimeCommandStatus | undefined): AutomationStudioFailureRecord | null {
  if (status === "timed_out") return coreFailure("timeout", "output_dispatch.timed_out", true);
  if (status === "rejected") return coreFailure("blocked_by_capability_or_policy", "output_dispatch.rejected", false, "dispatch");
  return null;
}

function confirmationFailureMessage(confirmation: ConfirmationOutcome | null): string | undefined {
  return confirmation && !confirmation.ok ? confirmation.error : undefined;
}

function coreFailure(category: AutomationStudioAdaptiveFailureClass, code: string, retryable: boolean, stage?: AutomationStudioFailureStage): AutomationStudioFailureRecord {
  return { category, code, retryable, ...(stage ? { stage } : {}) };
}

function missingOutputIdResult(runtimeLabel: "IO runtime" | "runtime"): AutomationNodeExecutionResult {
  const error = `Policy action has no outputId; legacy actionType execution is not supported by the ${runtimeLabel}.`;
  return { status: "failed", route: "failed", effects: [], outputs: { error }, message: error, failure: coreFailure("graph_validation_or_unknown_node", "output_dispatch.missing_output_id", false, "dispatch") };
}

function unregisteredOutputResult(outputId: string): AutomationNodeExecutionResult {
  const error = `Output is not registered: ${outputId}`;
  return { status: "failed", route: "failed", effects: [], outputs: { error }, message: error, failure: coreFailure("blocked_by_capability_or_policy", "output_dispatch.output_not_registered", false, "dispatch") };
}

function elementTargetRejectionResult(outputId: string, rejection: ElementTargetRejection): AutomationNodeExecutionResult {
  return {
    status: "failed",
    route: "failed",
    effects: [],
    outputs: { outputId, ok: false, error: rejection.error },
    message: rejection.error,
    failure: rejection.failure,
    ...targetResolutionField(rejection.resolution)
  };
}

function failedDispatchResult(
  outputs: Record<string, JsonValue>,
  detail: { message: string | undefined; failure: AutomationStudioFailureRecord | null; resolution: AutomationNodeTargetResolution | undefined }
): AutomationNodeExecutionResult {
  return {
    status: "failed",
    route: "failed",
    outputs,
    ...(detail.message ? { message: detail.message } : {}),
    ...(detail.failure ? { failure: detail.failure } : {}),
    ...targetResolutionField(detail.resolution)
  };
}

function targetResolutionField(resolution: AutomationNodeTargetResolution | undefined): { targetResolution?: AutomationNodeTargetResolution } {
  return resolution ? { targetResolution: resolution } : {};
}

function prepareElementTargetAction(
  io: IoRegistry,
  domainId: string | null | undefined,
  action: PolicyOutputAction
): { ok: true; action: PolicyOutputAction; diagnostics?: JsonObject; resolution?: AutomationNodeTargetResolution } | ElementTargetRejection {
  const outputId = action.outputId?.trim() ?? "";
  const output = outputId ? io.getOutput(domainId, outputId) : undefined;
  const parameters = action.parameters && typeof action.parameters === "object" && !Array.isArray(action.parameters) ? action.parameters as JsonObject : {};
  const target = normalizeAutomationStudioElementTarget(parameters.target, { source: "runtime" })
    ?? normalizeAutomationStudioElementTarget(parameters, { source: "runtime" });
  const outputRequiresElementTarget = output?.definition.metadata?.elementTarget === true || output?.definition.metadata?.targetKind === "element";
  if (!target) {
    if (!outputRequiresElementTarget) return { ok: true, action };
    return {
      ok: false,
      error: `Output ${outputId} declares element targeting but parameters.target does not contain an element fingerprint.`,
      failure: coreFailure("graph_validation_or_unknown_node", "element_target.missing_fingerprint", false, "target_resolution")
    };
  }
  const resolved = resolveElementTarget(target, elementTargetMinimumConfidence(output));
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    action: {
      ...action,
      parameters: compactJsonObject({ ...parameters, target: resolved.target }),
      metadata: compactJsonObject({ ...(action.metadata ?? {}), elementTargetResolution: resolved.diagnostics })
    },
    diagnostics: resolved.diagnostics,
    resolution: resolved.resolution
  };
}

function resolveElementTarget(
  target: AutomationStudioElementTarget,
  minimumConfidence: number
): { ok: true; target: AutomationStudioElementTarget; diagnostics: JsonObject; resolution: AutomationNodeTargetResolution } | ElementTargetRejection {
  if (!target.candidates?.length) {
    return {
      ok: true,
      target,
      diagnostics: { status: "unresolved_no_candidates", reason: "No runtime element candidates were supplied with the target." },
      resolution: { status: "unresolved_no_candidates", candidateCount: 0, minimumConfidence }
    };
  }
  const candidateCount = target.candidates.length;
  const best = elementMatcher.bestCandidate(target.fingerprint, target.candidates);
  if (!best) {
    return {
      ok: false,
      error: "Element target could not be matched to any runtime candidate.",
      failure: coreFailure("target_not_found", "element_target.no_match", true, "target_resolution"),
      resolution: { status: "no_match", candidateCount, minimumConfidence }
    };
  }
  const scored = {
    candidateId: best.candidateId,
    confidence: best.confidence,
    normalizedScore: best.normalizedScore,
    matchedSignals: best.matchedSignals,
    failedSignals: best.failedSignals
  };
  if (best.confidence < minimumConfidence) {
    const measured = Math.round(best.confidence * 100);
    const required = Math.round(minimumConfidence * 100);
    return {
      ok: false,
      error: `Element target match confidence ${measured}% is below the required ${required}%.`,
      failure: {
        ...coreFailure("target_not_found", "element_target.below_confidence", true, "target_resolution"),
        expected: `best candidate confidence of at least ${required}%`,
        actual: `best candidate confidence ${measured}%`
      },
      resolution: { status: "below_confidence", candidateCount, minimumConfidence, ...scored }
    };
  }
  const selectedCandidate = {
    candidateId: best.candidateId,
    confidence: best.confidence,
    matchedSignals: best.matchedSignals,
    failedSignals: best.failedSignals,
    metadata: { totalScore: best.totalScore, normalizedScore: best.normalizedScore }
  };
  return {
    ok: true,
    target: compactJsonObject({ ...target, selectedCandidate }) as unknown as AutomationStudioElementTarget,
    diagnostics: {
      status: "matched",
      candidateId: best.candidateId,
      confidence: best.confidence,
      matchedSignals: best.matchedSignals,
      failedSignals: best.failedSignals,
      normalizedScore: best.normalizedScore
    },
    resolution: { status: "matched", candidateCount, minimumConfidence, ...scored }
  };
}

function elementTargetMinimumConfidence(output: ReturnType<IoRegistry["getOutput"]>): number {
  const configured = output?.definition.metadata?.elementTargetMinConfidence;
  if (typeof configured === "number" && Number.isFinite(configured)) return Math.max(0, Math.min(1, configured));
  switch (output?.definition.safety?.level) {
    case "destructive": return 0.9;
    case "privileged": return 0.82;
    case "review": return 0.68;
    case "safe": return 0.45;
    default: return 0.5;
  }
}

function policyActionFromPayload(payload: JsonObject): PolicyOutputAction {
  return {
    actionType: typeof payload.outputId === "string" ? payload.outputId : "",
    parameters: payload.parameters && typeof payload.parameters === "object" && !Array.isArray(payload.parameters) ? payload.parameters as JsonObject : {},
    ...(typeof payload.outputId === "string" ? { outputId: payload.outputId } : {}),
    ...(typeof payload.confirmationInputId === "string" && payload.confirmationInputId ? { confirmationInputId: payload.confirmationInputId } : {}),
    ...(typeof payload.confirmationTimeoutMs === "number" ? { confirmationTimeoutMs: payload.confirmationTimeoutMs } : {}),
    ...(payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? { metadata: payload.metadata as JsonObject } : {})
  };
}

async function runtimeCanDispatchOutput(runtime: RuntimeService, domainId: string | null | undefined, outputId: string): Promise<boolean> {
  const capabilities = await runtime.capabilities();
  return capabilities.some((capability) => {
    if (capability.domainId !== undefined && capability.domainId !== (domainId ?? null)) return false;
    return capability.outputIds?.includes(outputId) || capability.actionTypes?.includes(outputId);
  });
}

function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))) as JsonObject;
}
