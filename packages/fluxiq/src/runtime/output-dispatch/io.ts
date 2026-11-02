import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { ClientGatewayCommandContext } from "../../client-gateway/service/command-ledger/index.ts";
import type { AutomationNodeExecutionResult } from "../../components/automation/index.ts";
import type { OutputDispatchIo } from "./ports/index.ts";
import type { RegisteredOutputAction } from "./action.ts";
import type { OutputTargetPreparer } from "./target-preparer.ts";
import { awaitConfirmation } from "./confirmation/index.ts";
import { compactJsonObject } from "./compact.ts";
import { prepareOutputAction } from "./prepare-action.ts";
import { dispatchedRoute, dispatchFailure, confirmationFailureMessage, missingOutputIdResult, unregisteredOutputResult, elementTargetRejectionResult, failedDispatchResult, targetResolutionField, clearedWaitField, actionabilityField } from "./results/index.ts";
import { invokeObservedOutputMethod, invokeObservedOutputSync, type OutputExecutionObservation } from "./admission/internal/index.ts";
/** Dispatches an output-native policy action through an importer-registered adapter. */
export async function dispatchRegisteredOutput(io: OutputDispatchIo, domainId: string | null | undefined, action: RegisteredOutputAction, signal?: AbortSignal, commandContext?: ClientGatewayCommandContext, targetPreparer?: OutputTargetPreparer, observation?: OutputExecutionObservation): Promise<AutomationNodeExecutionResult> {
  const outputId = action.outputId?.trim();
  if (!outputId)
    return missingOutputIdResult("IO runtime");
  const output = invokeObservedOutputSync(observation, { receiver: io, callback: io.getOutput, args: [domainId, outputId] });
  if (!output)
    return unregisteredOutputResult(outputId);
  const prepared = prepareOutputAction(action, domainId ?? null, output.definition, targetPreparer, observation);
  if (!prepared.ok)
    return elementTargetRejectionResult(outputId, prepared);
  action = prepared.action;
  const confirmation = awaitConfirmation(io, domainId, action, signal, observation);
  const request = {
    ...(commandContext ? { commandContext, ...(signal ? { signal } : {}) } : {}),
    domainId: domainId ?? null,
    outputId,
    payload: action.parameters as JsonObject,
    metadata: compactJsonObject({ ...(action.metadata ?? {}), ...(prepared.diagnostics ? { elementTargetResolution: prepared.diagnostics } : {}) })
  };
  const result = await invokeObservedOutputMethod(observation, { receiver: io, callback: io.dispatchOutput, args: [request] }, signal, request);
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
  if (result.ok && (!confirmationResult || confirmationResult.ok))
    return { status: "success", route: dispatchedRoute(result.payload), outputs, ...targetResolutionField(prepared.resolution), ...clearedWaitField(result.clearedWait), ...actionabilityField(result) };
  return {
    ...failedDispatchResult(outputs, {
      message: confirmationFailureMessage(confirmationResult) ?? result.error,
      failure: dispatchFailure(result.ok, result.status, result.failure, confirmationResult),
      resolution: prepared.resolution
    }), ...clearedWaitField(result.clearedWait), ...actionabilityField(result)
  };
}
