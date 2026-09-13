import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodeExpectationEvaluator } from "../../nodes/index.ts";
import { getAutomationNodeDefinition, resolveAutomationNodeParameterValues } from "../../nodes/index.ts";
import { hostExpectationEvaluator, hostRuntimeCapabilityIds, type AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import { nodeAttemptFromResult } from "./attempt-trace.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { captureHostState, enrichAttemptWithHostState } from "./host-state.ts";
import { collectNodeInputs } from "./node-inputs.ts";
import type { AutomationStudioTraceWithholding } from "./trace-withholding.ts";
import { attemptWithHostExpectationEvaluation } from "./transition-comparison.ts";

export async function executeAutomationStudioNode(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  withholding: AutomationStudioTraceWithholding
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
  // Recorded before any branch below can return: what resolution supplied is
  // withheld from the trace whether or not this node goes on to execute, and
  // whether or not the rest of its bindings resolved.
  withholding.record(node.parameterValues ?? {}, resolvedParameters.values);
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
      const result = await dispatchAutomationStudioEffects(native.result, options, withholding);
      return await finishAttempt(executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), ...(native.logs?.length ? { logs: native.logs } : {}) }, options, beforeAction, hostCapabilities);
    }
    const composite = await options.compositeExecutor?.({ node: executionNode, inputs, options });
    if (composite) {
      return await finishAttempt(executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, composite.result), ...(composite.childTrace ? { childTrace: composite.childTrace } : {}), ...(composite.compositeTarget ? { compositeTarget: composite.compositeTarget } : {}) }, options, beforeAction, hostCapabilities);
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
  // The node asks the host whether expected state holds; Core names which node
  // and attempt asked, and which snapshot the question is about.
  const boundEvaluator = hostExpectationEvaluator(options.hostRuntime);
  const expectationEvaluator: AutomationNodeExpectationEvaluator | undefined = boundEvaluator
    ? (conditions, mode, timeoutMs, evaluationContext) => boundEvaluator(conditions, mode, timeoutMs, { ...evaluationContext, nodeId: node.id, attemptId, ...(beforeAction ? { stateRef: beforeAction.stateRef } : {}) })
    : undefined;
  try {
    const context = {
      inputs,
      parameters: resolvedParameters.values,
      variables: new Map(Object.entries(options.variables ?? {})),
      ...(options.random ? { random: options.random } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(expectationEvaluator ? { expectationEvaluator } : {})
    };
    let result = await definition.execute(context);
    result = await dispatchAutomationStudioEffects(result, options, withholding);
    return await finishAttempt(executionNode, nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), options, beforeAction, hostCapabilities);
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

// Host state is captured first, so the expectation evaluator is asked about the
// snapshot the attempt actually ended on.
async function finishAttempt(
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions,
  beforeAction: AutomationStudioHostStateSnapshotRef | undefined,
  hostCapabilities: string[]
): Promise<AutomationStudioNodeAttemptTrace> {
  const enriched = await enrichAttemptWithHostState(attempt, options, beforeAction, hostCapabilities);
  return await attemptWithHostExpectationEvaluation(node, enriched, options);
}

async function dispatchAutomationStudioEffects(initial: AutomationNodeExecutionResult, options: AutomationStudioGraphExecutionOptions, withholding: AutomationStudioTraceWithholding): Promise<AutomationNodeExecutionResult> {
  let result = initial; if (!options.effectDispatcher) return result;
  for (const effect of result.effects ?? []) {
    const dispatched = await options.effectDispatcher(effect, effectDispatchContext(options, withholding)); if (!dispatched) continue;
    const outputs = { ...(result.outputs ?? {}), ...(dispatched.outputs ?? {}) };
    // The attempt trace classifies from the dispatcher's target resolution,
    // failure record, and message, so they survive the merge.
    const targetResolution = dispatched.targetResolution ? { targetResolution: dispatched.targetResolution } : {};
    if (dispatched.status === "failed") {
      result = {
        ...result,
        outputs,
        status: "failed",
        route: dispatched.route ?? "failed",
        ...targetResolution,
        ...(dispatched.message ? { message: dispatched.message } : {}),
        ...(dispatched.failure ? { failure: dispatched.failure } : {})
      };
      break;
    }
    result = { ...result, outputs, ...targetResolution };
  }
  return result;
}

type EffectDispatchContext = Parameters<NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>>[1];

// What the run has resolved out of state travels with each dispatch, so a
// dispatcher that saves its own record of the command -- the framework
// runtime's command attempt -- withholds the values the trace withholds. A dispatch with
// neither a signal nor a withheld value gets no context, as before.
function effectDispatchContext(options: AutomationStudioGraphExecutionOptions, withholding: AutomationStudioTraceWithholding): EffectDispatchContext {
  const withheldValues = withholding.values();
  const withholds = withheldValues.texts.length > 0 || withheldValues.numbers.length > 0;
  if (!options.signal && !withholds) return undefined;
  return { ...(options.signal ? { signal: options.signal } : {}), ...(withholds ? { withheldValues } : {}) };
}

function sideEffectClassForNode(node: AutomationStudioFlowNode): "none" | "internal" | "external" | "destructive" {
  if (node.metadata?.destructive === true) return "destructive";
  if (node.metadata?.externalSideEffect === true) return "external";
  if (node.definitionId === "builtin.policy.action") return "external";
  if (node.definitionId.startsWith("builtin.database.")) return node.parameterValues?.dryRun === true ? "internal" : "external";
  return "none";
}
