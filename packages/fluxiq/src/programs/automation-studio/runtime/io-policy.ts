import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { IoRegistry } from "../../../io/index.ts";
import type { PolicyAction } from "../model/index.ts";
import type { AutomationNodeExecutionResult } from "../nodes/contracts.ts";

/** Dispatches an output-native policy action through an importer-registered adapter. */
export async function dispatchPolicyOutput(
  io: IoRegistry,
  domainId: string | null | undefined,
  action: Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata">
): Promise<AutomationNodeExecutionResult> {
  const outputId = action.outputId?.trim();
  if (!outputId) {
    return { status: "failed", route: "failed", effects: [], outputs: { error: "Policy action has no outputId; legacy actionType execution is not supported by the IO runtime." } };
  }
  if (!io.hasOutput(domainId, outputId)) {
    return { status: "failed", route: "failed", effects: [], outputs: { error: `Output is not registered: ${outputId}` } };
  }
  const confirmation = action.confirmationInputId
    ? io.waitForInput({ domainId: domainId ?? null, inputId: action.confirmationInputId, ...(action.confirmationTimeoutMs !== undefined ? { timeoutMs: action.confirmationTimeoutMs } : {}) })
      .then((event) => ({ ok: true as const, event }))
      .catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "Output confirmation failed." }))
    : null;
  const result = await io.dispatchOutput({
    domainId: domainId ?? null,
    outputId,
    payload: action.parameters as JsonObject,
    ...(action.metadata ? { metadata: action.metadata } : {})
  });
  const confirmationResult = result.ok && confirmation ? await confirmation : null;
  const outputs: Record<string, JsonValue> = {
    outputId,
    ok: result.ok,
    ...(action.confirmationInputId ? { confirmationInputId: action.confirmationInputId, confirmation: confirmationResult?.ok ?? false } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(!confirmationResult?.ok && confirmationResult?.error ? { error: confirmationResult.error } : {}),
    ...(result.payload !== undefined ? { result: result.payload as JsonValue } : {})
  };
  return result.ok && (!confirmationResult || confirmationResult.ok)
    ? { status: "success", route: "success", outputs }
    : { status: "failed", route: "failed", outputs };
}

export function createIoPolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined) {
  return async (effect: { type: string; payload?: JsonValue }): Promise<AutomationNodeExecutionResult | undefined> => {
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
    return dispatchPolicyOutput(io, domainId, action);
  };
}
