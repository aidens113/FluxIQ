import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { ClientGatewayCommandContext } from "../../client-gateway/service/command-ledger/index.ts";
import type { AutomationNodeExecutionResult } from "../../components/automation/index.ts";
import type { FluxIQRuntimeWithheldValues } from "../contracts.ts";
import { automationStudioReferenceNow } from "../reference-time/index.ts";
import type { OutputDispatchIo, OutputDispatchRuntime } from "./ports/index.ts";
import type { OutputTargetPreparer } from "./target-preparer.ts";
import { awaitConfirmation } from "./confirmation/index.ts";
import { compactJsonObject } from "./compact.ts";
import { prepareOutputAction } from "./prepare-action.ts";
import { registeredOutputActionFromPayload } from "./effect-action.ts";
import { dispatchRegisteredOutput } from "./io.ts";
import { dispatchedRoute, dispatchFailure, confirmationFailureMessage, missingOutputIdResult, unregisteredOutputResult, elementTargetRejectionResult, failedDispatchResult, targetResolutionField, clearedWaitField, actionabilityField } from "./results/index.ts";
import { OutputObservationBindings, OutputOrchestrationCallbacks, invokeObservedOutputMethod, invokeObservedOutputSync, type OutputExecutionObservation } from "./admission/internal/index.ts";
export function createRuntimeOutputEffectDispatcher(io: OutputDispatchIo, domainId: string | null | undefined, runtime: OutputDispatchRuntime, targetPreparer?: OutputTargetPreparer) {
  return async (effect: {
    type: string;
    payload?: JsonValue;
  }, context?: {
    signal?: AbortSignal;
    referenceNow?: number;
    withheldValues?: FluxIQRuntimeWithheldValues;
    commandContext?: ClientGatewayCommandContext;
  }): Promise<AutomationNodeExecutionResult | undefined> => {
    if (effect.type !== "policy.output.dispatch" || !effect.payload || typeof effect.payload !== "object" || Array.isArray(effect.payload))
      return undefined;
    const payload = effect.payload as JsonObject;
    const observation = OutputObservationBindings.take(context);
    let action = registeredOutputActionFromPayload(payload);
    const outputId = action.outputId?.trim();
    if (!outputId)
      return missingOutputIdResult("runtime");
    if (!invokeObservedOutputSync(observation, { receiver: io, callback: io.hasOutput, args: [domainId, outputId] }))
      return unregisteredOutputResult(outputId);
    const output = invokeObservedOutputSync(observation, { receiver: io, callback: io.getOutput, args: [domainId, outputId] });
    if (!output)
      return unregisteredOutputResult(outputId);
    const prepared = prepareOutputAction(action, domainId ?? null, output.definition, targetPreparer, observation);
    if (!prepared.ok)
      return elementTargetRejectionResult(outputId, prepared);
    action = prepared.action;
    if (!await runtimeCanDispatchOutput(runtime, domainId, outputId, observation))
      return dispatchRegisteredOutput(io, domainId, action, context?.signal, context?.commandContext, targetPreparer, observation);
    const confirmation = awaitConfirmation(io, domainId, action, context?.signal, observation);
    const referenceNow = automationStudioReferenceNow(context?.referenceNow);
    const command = {
      kind: "execute_action" as const,
      domainId: domainId ?? null,
      outputId,
      actionType: outputId,
      parameters: action.parameters as JsonObject,
      ...(typeof payload.timeoutMs === "number" ? { timeoutMs: payload.timeoutMs } : {}),
      metadata: compactJsonObject({ ...(action.metadata ?? {}), ...(prepared.diagnostics ? { elementTargetResolution: prepared.diagnostics } : {}) })
    };
    const dispatchContext = {
      ...(context?.commandContext ? { commandContext: context.commandContext } : {}),
      ...(context?.signal ? { signal: context.signal } : {}),
      ...(referenceNow !== undefined ? { referenceNow } : {}),
      // The runtime withholds these from the command attempt it saves; the command still carries them.
      ...(context?.withheldValues ? { withheldValues: context.withheldValues } : {}),
      // A dispatch that carries `recordOutput` returns records, which are stored only
      // as their dataset allows, so the saved attempt holds the withheld marker in
      // place of the payload. The result returned here still carries them.
      ...(payload.recordOutput !== undefined && payload.recordOutput !== null ? { withheldResultPayload: true } : {}),
      ...(typeof action.metadata?.clientId === "string" ? { preferredClientId: action.metadata.clientId } : {}),
      ...(typeof action.metadata?.sessionId === "string" ? { preferredSessionId: action.metadata.sessionId } : {})
    };
    const result = await invokeObservedOutputMethod(observation, { receiver: runtime, callback: runtime.dispatch, args: [command, dispatchContext] }, context?.signal, dispatchContext);
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
    if (result.status === "succeeded" && (!confirmationResult || confirmationResult.ok))
      return { status: "success", route: dispatchedRoute(result.payload), outputs, ...targetResolutionField(prepared.resolution), ...clearedWaitField(result.clearedWait), ...actionabilityField(result) };
    return {
      ...failedDispatchResult(outputs, {
        message: confirmationFailureMessage(confirmationResult) ?? result.message ?? result.error,
        failure: dispatchFailure(result.status === "succeeded", result.status, result.failure, confirmationResult),
        resolution: prepared.resolution
      }), ...clearedWaitField(result.clearedWait), ...actionabilityField(result)
    };
  };
}
async function runtimeCanDispatchOutput(runtime: OutputDispatchRuntime, domainId: string | null | undefined, outputId: string, observation?: OutputExecutionObservation): Promise<boolean> {
  const callback = runtime.capabilities;
  const args: [OutputExecutionObservation?] = observation && OutputOrchestrationCallbacks.has(runtime, callback) ? [observation] : [];
  const capabilities = await invokeObservedOutputMethod(observation, { receiver: runtime, callback, args });
  return capabilities.some((capability) => {
    if (capability.domainId !== undefined && capability.domainId !== (domainId ?? null))
      return false;
    return capability.outputIds?.includes(outputId) || capability.actionTypes?.includes(outputId);
  });
}
