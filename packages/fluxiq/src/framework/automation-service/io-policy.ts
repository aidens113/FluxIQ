import {
  parseAutomationStudioFailureRecord,
  type AutomationStudioAdaptiveFailureClass,
  type AutomationStudioFailureRecord,
  type AutomationStudioFailureStage
} from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { ClientGatewayCommandContext } from "../../client-gateway/service/command-ledger/index.ts";
import { IoRegistry } from "../../io/index.ts";
import type { FluxIQRuntimeCommandStatus, FluxIQRuntimeWithheldValues, RuntimeService } from "../../runtime/index.ts";
import { readRuntimeTargetActionability } from "../../runtime/result-control/index.ts";
import { compactJsonObject, prepareOutputAction, type OutputTargetPreparer, type PreparedOutputAction } from "../../runtime/output-dispatch/index.ts";
import type { PolicyAction } from "../../flows/authoring/model/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodeTargetResolution } from "../../components/automation/index.ts";
import { automationStudioReferenceNow } from "../../runtime/reference-time/index.ts";

type PolicyOutputAction = Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata">;
type ConfirmationOutcome = { ok: true } | { ok: false; error: string; cancelled: boolean };
type ElementTargetRejection = Extract<PreparedOutputAction, { ok: false }>;

/** Dispatches an output-native policy action through an importer-registered adapter. */
export async function dispatchPolicyOutput(
  io: IoRegistry,
  domainId: string | null | undefined,
  action: PolicyOutputAction,
  signal?: AbortSignal,
  commandContext?: ClientGatewayCommandContext,
  outputTargetPreparer?: OutputTargetPreparer
): Promise<AutomationNodeExecutionResult> {
  const outputId = action.outputId?.trim();
  if (!outputId) return missingOutputIdResult("IO runtime");
  const output = io.getOutput(domainId, outputId);
  if (!output) return unregisteredOutputResult(outputId);
  const prepared = prepareElementTargetAction(io, domainId, action, outputTargetPreparer);
  if (!prepared.ok) return elementTargetRejectionResult(outputId, prepared);
  action = prepared.action;
  const confirmation = awaitConfirmation(io, domainId, action, signal);
  const result = await io.dispatchOutput({
    ...(commandContext ? { commandContext, ...(signal ? { signal } : {}) } : {}),
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
  if (result.ok && (!confirmationResult || confirmationResult.ok)) return { status: "success", route: dispatchedRoute(result.payload), outputs, ...targetResolutionField(prepared.resolution), ...clearedWaitField(result.clearedWait), ...actionabilityField(result) };
  return { ...failedDispatchResult(outputs, {
    message: confirmationFailureMessage(confirmationResult) ?? result.error,
    failure: dispatchFailure(result.ok, result.status, result.failure, confirmationResult),
    resolution: prepared.resolution
  }), ...clearedWaitField(result.clearedWait), ...actionabilityField(result) };
}

export function createIoPolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined, outputTargetPreparer?: OutputTargetPreparer) {
  return async (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal; commandContext?: ClientGatewayCommandContext }): Promise<AutomationNodeExecutionResult | undefined> => {
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
    return dispatchPolicyOutput(io, domainId, action, context?.signal, context?.commandContext, outputTargetPreparer);
  };
}

export function createRuntimePolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined, runtime: RuntimeService, outputTargetPreparer?: OutputTargetPreparer) {
  return async (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal; referenceNow?: number; withheldValues?: FluxIQRuntimeWithheldValues; humanness?: number; humannessMisclick?: true; commandContext?: ClientGatewayCommandContext }): Promise<AutomationNodeExecutionResult | undefined> => {
    if (effect.type !== "policy.output.dispatch" || !effect.payload || typeof effect.payload !== "object" || Array.isArray(effect.payload)) return undefined;
    const payload = effect.payload as JsonObject;
    let action = policyActionFromPayload(payload);
    const outputId = action.outputId?.trim();
    if (!outputId) return missingOutputIdResult("runtime");
    if (!io.hasOutput(domainId, outputId)) return unregisteredOutputResult(outputId);
    const prepared = prepareElementTargetAction(io, domainId, action, outputTargetPreparer);
    if (!prepared.ok) return elementTargetRejectionResult(outputId, prepared);
    action = prepared.action;
    if (!await runtimeCanDispatchOutput(runtime, domainId, outputId)) return dispatchPolicyOutput(io, domainId, action, context?.signal, context?.commandContext, outputTargetPreparer);
    const confirmation = awaitConfirmation(io, domainId, action, context?.signal);
    const referenceNow = automationStudioReferenceNow(context?.referenceNow);
    const result = await runtime.dispatch({
      kind: "execute_action",
      domainId: domainId ?? null,
      outputId,
      actionType: outputId,
      parameters: action.parameters as JsonObject,
      ...(typeof payload.timeoutMs === "number" ? { timeoutMs: payload.timeoutMs } : {}),
      ...(context?.humanness !== undefined ? { humanness: context.humanness } : {}),
      ...(context?.humannessMisclick === true ? { humannessMisclick: true as const } : {}),
      metadata: compactJsonObject({ ...(action.metadata ?? {}), ...(prepared.diagnostics ? { elementTargetResolution: prepared.diagnostics } : {}) })
    }, {
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
    if (result.status === "succeeded" && (!confirmationResult || confirmationResult.ok)) return { status: "success", route: dispatchedRoute(result.payload), outputs, ...targetResolutionField(prepared.resolution), ...clearedWaitField(result.clearedWait), ...actionabilityField(result) };
    return { ...failedDispatchResult(outputs, {
      message: confirmationFailureMessage(confirmationResult) ?? result.message ?? result.error,
      failure: dispatchFailure(result.status === "succeeded", result.status, result.failure, confirmationResult),
      resolution: prepared.resolution
    }), ...clearedWaitField(result.clearedWait), ...actionabilityField(result) };
  };
}

// An output may answer which of its node's routes a success takes by naming
// it in its result payload, as `route`: a list that has no further page, say.
// Only a success is lifted, and never onto `success` or `failed`, which are
// the dispatch's own to say; whether the node declares that route is the
// executor's to check (`executor/node-execution.ts`).
function dispatchedRoute(payload: unknown): string {
  const route = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { route?: unknown }).route : undefined;
  return typeof route === "string" && route.length > 0 && route !== "success" && route !== "failed" ? route : "success";
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

// A wait the target reports clearing by itself is carried on to the executor,
// which tells the run's activity stream; whether it is readable is decided
// there, so a failed dispatch carries it too. Absent stays absent.
function clearedWaitField(clearedWait: AutomationNodeExecutionResult["clearedWait"]): Pick<AutomationNodeExecutionResult, "clearedWait"> {
  return clearedWait !== undefined ? { clearedWait } : {};
}

function actionabilityField(result: unknown): Pick<AutomationNodeExecutionResult, "actionability"> {
  const reading = readRuntimeTargetActionability(result);
  return reading.kind === "valid" ? { actionability: reading.record } : {};
}

function prepareElementTargetAction(
  io: IoRegistry,
  domainId: string | null | undefined,
  action: PolicyOutputAction,
  outputTargetPreparer: OutputTargetPreparer | undefined
): PreparedOutputAction {
  const outputId = action.outputId?.trim() ?? "";
  const output = outputId ? io.getOutput(domainId, outputId) : undefined;
  return output ? prepareOutputAction(action, domainId ?? null, output.definition, outputTargetPreparer) : { ok: true, action };
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

