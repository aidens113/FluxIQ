import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { IoRegistry } from "../../../io/index.ts";
import type { RuntimeService } from "../../../runtime/index.ts";
import { normalizeAutomationStudioElementTarget, type AutomationStudioElementTarget, type PolicyAction } from "../model/index.ts";
import { createAutomationStudioElementMatcher } from "../fingerprinting/index.ts";
import type { AutomationNodeExecutionResult } from "../nodes/contracts.ts";

const elementMatcher = createAutomationStudioElementMatcher();

/** Dispatches an output-native policy action through an importer-registered adapter. */
export async function dispatchPolicyOutput(
  io: IoRegistry,
  domainId: string | null | undefined,
  action: Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata">,
  signal?: AbortSignal
): Promise<AutomationNodeExecutionResult> {
  const outputId = action.outputId?.trim();
  if (!outputId) {
    return { status: "failed", route: "failed", effects: [], outputs: { error: "Policy action has no outputId; legacy actionType execution is not supported by the IO runtime." } };
  }
  const output = io.getOutput(domainId, outputId);
  if (!output) {
    return { status: "failed", route: "failed", effects: [], outputs: { error: `Output is not registered: ${outputId}` } };
  }
  const prepared = prepareElementTargetAction(io, domainId, action);
  if (!prepared.ok) return { status: "failed", route: "failed", effects: [], outputs: { outputId, ok: false, error: prepared.error } };
  action = prepared.action;
  const confirmation = action.confirmationInputId
    ? io.waitForInput({ domainId: domainId ?? null, inputId: action.confirmationInputId, ...(action.confirmationTimeoutMs !== undefined ? { timeoutMs: action.confirmationTimeoutMs } : {}), ...(signal ? { signal } : {}) })
      .then((event) => ({ ok: true as const, event }))
      .catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "Output confirmation failed." }))
    : null;
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
  return result.ok && (!confirmationResult || confirmationResult.ok)
    ? { status: "success", route: "success", outputs }
    : { status: "failed", route: "failed", outputs };
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
    if (!outputId) return { status: "failed", route: "failed", effects: [], outputs: { error: "Policy action has no outputId; legacy actionType execution is not supported by the runtime." } };
    if (!io.hasOutput(domainId, outputId)) return { status: "failed", route: "failed", effects: [], outputs: { error: `Output is not registered: ${outputId}` } };
    const prepared = prepareElementTargetAction(io, domainId, action);
    if (!prepared.ok) return { status: "failed", route: "failed", effects: [], outputs: { outputId, ok: false, error: prepared.error } };
    action = prepared.action;
    if (!await runtimeCanDispatchOutput(runtime, domainId, outputId)) return dispatchPolicyOutput(io, domainId, action, context?.signal);
    const confirmation = action.confirmationInputId
      ? io.waitForInput({ domainId: domainId ?? null, inputId: action.confirmationInputId, ...(action.confirmationTimeoutMs !== undefined ? { timeoutMs: action.confirmationTimeoutMs } : {}), ...(context?.signal ? { signal: context.signal } : {}) })
        .then((event) => ({ ok: true as const, event }))
        .catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "Output confirmation failed." }))
      : null;
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
    return result.status === "succeeded" && (!confirmationResult || confirmationResult.ok)
      ? { status: "success", route: "success", outputs }
      : { status: "failed", route: "failed", outputs };
  };
}

function prepareElementTargetAction(
  io: IoRegistry,
  domainId: string | null | undefined,
  action: Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata">
): { ok: true; action: typeof action; diagnostics?: JsonObject } | { ok: false; error: string } {
  const outputId = action.outputId?.trim() ?? "";
  const output = outputId ? io.getOutput(domainId, outputId) : undefined;
  const parameters = action.parameters && typeof action.parameters === "object" && !Array.isArray(action.parameters) ? action.parameters as JsonObject : {};
  const target = normalizeAutomationStudioElementTarget(parameters.target, { source: "runtime" })
    ?? normalizeAutomationStudioElementTarget(parameters, { source: "runtime" });
  const outputRequiresElementTarget = output?.definition.metadata?.elementTarget === true || output?.definition.metadata?.targetKind === "element";
  if (!target) {
    if (!outputRequiresElementTarget) return { ok: true, action };
    return { ok: false, error: `Output ${outputId} declares element targeting but parameters.target does not contain an element fingerprint.` };
  }
  const resolved = resolveElementTarget(target, elementTargetMinimumConfidence(output));
  if (!resolved.ok) return { ok: false, error: resolved.error };
  return {
    ok: true,
    action: {
      ...action,
      parameters: compactJsonObject({ ...parameters, target: resolved.target }),
      metadata: compactJsonObject({ ...(action.metadata ?? {}), ...(resolved.diagnostics ? { elementTargetResolution: resolved.diagnostics } : {}) })
    },
    ...(resolved.diagnostics ? { diagnostics: resolved.diagnostics } : {})
  };
}

function resolveElementTarget(target: AutomationStudioElementTarget, minimumConfidence: number): { ok: true; target: AutomationStudioElementTarget; diagnostics?: JsonObject } | { ok: false; error: string } {
  if (!target.candidates?.length) {
    return { ok: true, target, diagnostics: { status: "unresolved_no_candidates", reason: "No runtime element candidates were supplied with the target." } };
  }
  const best = elementMatcher.bestCandidate(target.fingerprint, target.candidates);
  if (!best) return { ok: false, error: "Element target could not be matched to any runtime candidate." };
  if (best.confidence < minimumConfidence) return { ok: false, error: `Element target match confidence ${Math.round(best.confidence * 100)}% is below the required ${Math.round(minimumConfidence * 100)}%.` };
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
    }
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

function policyActionFromPayload(payload: JsonObject): Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata"> {
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
