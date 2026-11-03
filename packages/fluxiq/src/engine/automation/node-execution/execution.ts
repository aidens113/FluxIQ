import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { combineAutomationStudioResolvedActionEffects } from "../../../components/automation/action-effect/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioRunState } from "../state/index.ts";
import type { AutomationStudioTraceWithholding } from "../trace/index.ts";
import { collectNodeInputs } from "../graph-navigation/index.ts";
import { nodeAttemptWithAdaptationIds } from "../trace/index.ts";
import { AutomationStudioNodeAttemptExecution } from "./attempt.ts";
import { automationStudioNodeAttemptFailure } from "./failure.ts";
import type { AutomationStudioParameterRefreshOverlay } from "../parameter-refresh/index.ts";
import type { AutomationStudioRuntimeRepeatSample } from "../repeat/index.ts";
import { registerAutomationExecutionKernel, prepareAutomationFrame, invokeAutomationFrame, invokeAutomationCallbackSync, automationExecutionProperty, automationExecutionClock } from "../execution-admission/kernel/index.ts";

const observedAttemptKernel = registerAutomationExecutionKernel(undefined, executeNodeBody, "attempt");

/**
 * Executes one node and returns its attempt, stamped with the saved changes the
 * node carries. Every path below returns through here, so an attempt of an
 * adapted node names its adaptations whether it succeeded or failed, and
 * however it failed.
 *
 * **It never rejects.** Whatever the node was -- a built-in, a domain output
 * behind an effect dispatcher, a host-executed one, a composite Flow -- and
 * whatever threw, from the dispatch itself or from capturing host state around
 * it, the throw comes back as a classified failed attempt and the run goes on to
 * decide what to do about it. That is what makes this the one seam: the default
 * defensive policy cannot be bypassed by a dispatch path that throws instead of
 * returning, and a path added tomorrow is covered by having been added inside
 * here.
 *
 * It was bypassable. `nativeNodeExecutor` and `compositeExecutor` were both
 * awaited outside the inner `try`, so a host-executed node or a Call Flow child
 * that threw rejected the whole graph run -- no attempt, no trace, no retry, no
 * recovery ladder, nothing for a person to read. The inner catch stays because it
 * can enrich the attempt with the host state captured before the action; this one
 * is the guarantee.
 */
export async function executeAutomationStudioNode(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  withholding: AutomationStudioTraceWithholding,
  runState: AutomationStudioRunState,
  parameterOverlay?: AutomationStudioParameterRefreshOverlay,
  repeatSample?: AutomationStudioRuntimeRepeatSample
): Promise<AutomationStudioNodeAttemptTrace> {
  const frame = await prepareAutomationFrame(options, { receiver: undefined, callback: executeNodeBody }, observedAttemptKernel);
  if (!frame) return await executeNodeBody(flow, node, values, options, attemptNumber, withholding, runState, parameterOverlay, repeatSample);
  return await invokeAutomationFrame(frame, { receiver: undefined, callback: executeNodeBody, args: [flow, node, values, frame.options, attemptNumber, withholding, runState, parameterOverlay, repeatSample] });
}

async function executeNodeBody(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  withholding: AutomationStudioTraceWithholding,
  runState: AutomationStudioRunState,
  parameterOverlay?: AutomationStudioParameterRefreshOverlay,
  repeatSample?: AutomationStudioRuntimeRepeatSample
): Promise<AutomationStudioNodeAttemptTrace> {
  // A fresh pass must not inherit the previous pass's floor, including when
  // the first checkpoint or local preparation fails. Raw unresolved values
  // provide a conservative floor until this attempt can specialize them.
  runState.actionEffects.delete(node.id);
  runState.dispatchedActions.delete(node.id);
  try {
    if (parameterOverlay?.effectFailure) throw new Error("executor.action_effect.resolve_failed");
    const resolve = automationExecutionProperty(options, options, "resolveActionEffect");
    const resolved = resolve ? invokeAutomationCallbackSync(options, { receiver: options, callback: resolve, args: [node] }) : undefined;
    const actionEffect = combineAutomationStudioResolvedActionEffects([resolved, parameterOverlay?.floor]);
    if (actionEffect) runState.actionEffects.set(node.id, actionEffect);
  } catch {
    const startedAt = automationExecutionClock(options, "now", options);
    return nodeAttemptWithAdaptationIds(node, {
      attemptId: `${node.id}.attempt.${attemptNumber}`,
      nodeId: node.id,
      definitionId: node.definitionId,
      startedAt,
      finishedAt: startedAt,
      status: "failed",
      route: "failed",
      inputs: {},
      outputs: {},
      effects: [],
      message: "The trusted action-effect declaration could not be resolved; the action was not run.",
      failure: { category: "graph_validation_or_unknown_node", code: "executor.action_effect.resolve_failed", retryable: false, stage: "dispatch", effect: "unacted" }
    });
  }
  try {
    const attempt = await AutomationStudioNodeAttemptExecution.execute(flow, node, values, options, attemptNumber, withholding, runState, parameterOverlay, repeatSample);
    if (attempt.status === "failed" && runState.actionEffects.has(node.id) && !runState.dispatchedActions.has(node.id)) {
      attempt.failure = { ...(attempt.failure ?? { category: "graph_validation_or_unknown_node", code: "executor.action_effect.pre_dispatch_failed", retryable: false, stage: "dispatch" }), effect: "unacted" };
      if (attempt.fault) attempt.fault = { ...attempt.fault, effect: "unacted" };
    }
    await repeatSample?.after(attempt);
    return nodeAttemptWithAdaptationIds(node, attempt);
  } catch (error) {
    repeatSample?.abandon();
    const startedAt = automationExecutionClock(options, "now", options);
    return nodeAttemptWithAdaptationIds(node, automationStudioNodeAttemptFailure(node, error, options, attemptNumber, startedAt, collectNodeInputs(flow, node, values), runState.dispatchedActions.has(node.id)));
  }
}
