import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../nodes/index.ts";
import { getAutomationNodeDefinition, resolveAutomationNodeParameterValues } from "../../nodes/index.ts";
import { hostRuntimeCapabilityIds } from "../host-runtime.ts";
import { nodeAttemptFromResult } from "./attempt-trace.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { captureHostState, enrichAttemptWithHostState } from "./host-state.ts";
import { collectNodeInputs } from "./node-inputs.ts";

export async function executeAutomationStudioNode(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number
): Promise<AutomationStudioNodeAttemptTrace> {
  const startedAt = options.now?.() ?? Date.now();
  const attemptId = `${node.id}.attempt.${attemptNumber}`;
  const definition = getAutomationNodeDefinition(node.definitionId);
  const inputs = collectNodeInputs(flow, node, values);
  const resolvedParameters = resolveAutomationNodeParameterValues(node.parameterValues ?? {}, {
    ...(options.inputs ?? {}),
    ...(options.variables ?? {}),
    ...values,
    ...inputs
  });
  const executionNode = resolvedParameters.missingPaths.length
    ? node
    : { ...node, parameterValues: resolvedParameters.values };
  const hostCapabilities = hostRuntimeCapabilityIds(options.hostRuntime);
  if (resolvedParameters.missingPaths.length) {
    return {
      attemptId,
      nodeId: node.id,
      definitionId: node.definitionId,
      startedAt,
      finishedAt: options.now?.() ?? Date.now(),
      status: "failed",
      route: "failed",
      inputs,
      outputs: {},
      effects: [],
      message: `State-bound parameter path${resolvedParameters.missingPaths.length === 1 ? "" : "s"} could not be resolved: ${resolvedParameters.missingPaths.join(", ")}.`
    };
  }
  const beforeAction = await captureHostState(options, { node: executionNode, attemptId, inputs, point: "before_action" });
  if (definition && node.definitionVersion && node.definitionVersion !== "1.0.0") {
    return await enrichAttemptWithHostState({ attemptId, nodeId: node.id, definitionId: node.definitionId, startedAt, finishedAt: options.now?.() ?? Date.now(), status: "failed", route: "failed", inputs, outputs: {}, effects: [], message: `Node ${node.definitionId} pins ${node.definitionVersion}, but built-in version 1.0.0 is available.` }, options, beforeAction, hostCapabilities);
  }
  if (!definition?.execute) {
    const native = await options.nativeNodeExecutor?.({
      node: executionNode,
      inputs,
      ...(options.signal ? { signal: options.signal } : {}),
      hostContext: {
        capabilityIds: hostCapabilities,
        sideEffectClass: sideEffectClassForNode(executionNode),
        ...(beforeAction ? { currentStateRef: beforeAction, previousStateRef: beforeAction } : {}),
        ...(executionNode.parameterValues?.target !== undefined ? { target: executionNode.parameterValues.target } : {})
      }
    });
    if (native) {
      const result = await dispatchAutomationStudioEffects(native.result, options);
      return await enrichAttemptWithHostState({ ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), ...(native.logs?.length ? { logs: native.logs } : {}) }, options, beforeAction, hostCapabilities);
    }
    const composite = await options.compositeExecutor?.({ node: executionNode, inputs, options });
    if (composite) {
      return await enrichAttemptWithHostState({ ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, composite.result), ...(composite.childTrace ? { childTrace: composite.childTrace } : {}), ...(composite.compositeTarget ? { compositeTarget: composite.compositeTarget } : {}) }, options, beforeAction, hostCapabilities);
    }
    return await enrichAttemptWithHostState({
      attemptId,
      nodeId: node.id,
      definitionId: node.definitionId,
      startedAt,
      finishedAt: options.now?.() ?? Date.now(),
      status: "failed",
      route: "failed",
      inputs,
      outputs: {},
      effects: [],
      message: `Node definition is not executable: ${node.definitionId}.`
    }, options, beforeAction, hostCapabilities);
  }
  try {
    const context = {
      inputs,
      parameters: resolvedParameters.values,
      variables: new Map(Object.entries(options.variables ?? {})),
      ...(options.random ? { random: options.random } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    };
    let result = await definition.execute(context);
    result = await dispatchAutomationStudioEffects(result, options);
    return await enrichAttemptWithHostState(nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), options, beforeAction, hostCapabilities);
  } catch (error) {
    return await enrichAttemptWithHostState({
      attemptId,
      nodeId: node.id,
      definitionId: node.definitionId,
      startedAt,
      finishedAt: options.now?.() ?? Date.now(),
      status: "failed",
      route: "failed",
      inputs,
      outputs: {},
      effects: [],
      message: error instanceof Error ? error.message : "Node execution failed."
    }, options, beforeAction, hostCapabilities);
  }
}

async function dispatchAutomationStudioEffects(initial: AutomationNodeExecutionResult, options: AutomationStudioGraphExecutionOptions): Promise<AutomationNodeExecutionResult> {
  let result = initial; if (!options.effectDispatcher) return result;
  for (const effect of result.effects ?? []) {
    const dispatched = await options.effectDispatcher(effect, options.signal ? { signal: options.signal } : undefined); if (!dispatched) continue;
    const outputs = { ...(result.outputs ?? {}), ...(dispatched.outputs ?? {}) };
    if (dispatched.status === "failed") { result = { ...result, outputs, status: "failed", route: dispatched.route ?? "failed" }; break; }
    result = { ...result, outputs };
  }
  return result;
}

function sideEffectClassForNode(node: AutomationStudioFlowNode): "none" | "internal" | "external" | "destructive" {
  if (node.metadata?.destructive === true) return "destructive";
  if (node.metadata?.externalSideEffect === true) return "external";
  if (node.definitionId === "builtin.policy.action") return "external";
  if (node.definitionId.startsWith("builtin.database.")) return node.parameterValues?.dryRun === true ? "internal" : "external";
  return "none";
}
