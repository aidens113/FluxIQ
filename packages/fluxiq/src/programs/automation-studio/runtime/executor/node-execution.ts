import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult, AutomationNodeExpectationEvaluator } from "../../nodes/index.ts";
import { getAutomationNodeDefinition, resolveAutomationNodeParameterValues } from "../../nodes/index.ts";
import { hostExpectationEvaluator, hostRuntimeCapabilityIds, type AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import { AUTOMATION_STUDIO_ASK_EFFECT } from "../parking/index.ts";
import { nodeAttemptFromResult, nodeAttemptWithAdaptationIds } from "./attempt-trace.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace, AutomationStudioRecordBatch } from "./contracts.ts";
import { captureHostState, enrichAttemptWithHostState } from "./host-state.ts";
import { collectNodeInputs } from "./node-inputs.ts";
import { captureAutomationStudioRecordBatch, captureAutomationStudioWrittenRecords } from "./record-capture.ts";
import type { AutomationStudioRunState } from "./run-state.ts";
import type { AutomationStudioTraceWithholding } from "./trace-withholding.ts";
import { attemptWithHostExpectationEvaluation } from "./transition-comparison.ts";

/**
 * Executes one node and returns its attempt, stamped with the saved changes the
 * node carries. Every path below returns through here, so an attempt of an
 * adapted node names its adaptations whether it succeeded or failed, and
 * however it failed.
 */
export async function executeAutomationStudioNode(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  withholding: AutomationStudioTraceWithholding,
  runState: AutomationStudioRunState
): Promise<AutomationStudioNodeAttemptTrace> {
  const attempt = await executeNodeAttempt(flow, node, values, options, attemptNumber, withholding, runState);
  return nodeAttemptWithAdaptationIds(node, attempt);
}

async function executeNodeAttempt(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  withholding: AutomationStudioTraceWithholding,
  runState: AutomationStudioRunState
): Promise<AutomationStudioNodeAttemptTrace> {
  const startedAt = options.now?.() ?? Date.now();
  const attemptId = `${node.id}.attempt.${attemptNumber}`;
  const definition = getAutomationNodeDefinition(node.definitionId);
  const inputs = collectNodeInputs(flow, node, values);
  const resolvedParameters = resolveAutomationNodeParameterValues(node.parameterValues ?? {}, {
    ...(options.inputs ?? {}),
    // The run's live variables, not the seed it started from: a variable written
    // during the run -- inside a For Each body, say -- is what a later node's
    // binding has to read. `runState.variables` is seeded from
    // `options.variables`, so a run that writes none resolves exactly as before.
    ...Object.fromEntries(runState.variables),
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
    return await enrichAttemptWithHostState(executionNode, { attemptId, nodeId: node.id, definitionId: node.definitionId, startedAt, finishedAt: options.now?.() ?? Date.now(), status: "failed", route: "failed", inputs, outputs: {}, effects: [], message: `Node ${node.definitionId} pins ${node.definitionVersion}, but built-in version 1.0.0 is available.` }, options, beforeAction, hostCapabilities);
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
      const result = await dispatchAutomationStudioEffects(native.result, options, withholding, { runState, nodeId: node.id, attemptId });
      return await finishAttempt(executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), ...(native.logs?.length ? { logs: native.logs } : {}) }, options, beforeAction, hostCapabilities);
    }
    const composite = await options.compositeExecutor?.({ node: executionNode, inputs, options: callFlowChildOptions(options, attemptId) });
    if (composite) {
      return await finishAttempt(executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, composite.result), ...(composite.childTrace ? { childTrace: composite.childTrace } : {}), ...(composite.compositeTarget ? { compositeTarget: composite.compositeTarget } : {}) }, options, beforeAction, hostCapabilities);
    }
    return await enrichAttemptWithHostState(executionNode, {
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
      // Run-scoped: one map for the whole run, so a write reaches the nodes after it.
      variables: runState.variables,
      iteration: iterationFor(runState, node.id),
      ...(options.random ? { random: options.random } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(expectationEvaluator ? { expectationEvaluator } : {})
    };
    let result = await definition.execute(context);
    result = await dispatchAutomationStudioEffects(result, options, withholding, { runState, nodeId: node.id, attemptId });
    return await finishAttempt(executionNode, nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), options, beforeAction, hostCapabilities);
  } catch (error) {
    return await enrichAttemptWithHostState(executionNode, {
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
  const enriched = await enrichAttemptWithHostState(node, attempt, options, beforeAction, hostCapabilities);
  return await attemptWithHostExpectationEvaluation(node, enriched, options);
}

/** The attempt a dispatch belongs to, and the run state its captured rows are recorded in. */
type RecordCaptureTarget = { runState: AutomationStudioRunState; nodeId: string; attemptId: string };

/** The effect Write Records emits. It carries its rows, so no dispatcher is asked to handle it. */
const RECORDS_WRITE_EFFECT = "records.write";

// The three dispatch paths -- the IO runtime, the framework runtime, and a
// host's own dispatcher -- meet only here, so rows are captured here. A
// `records.write` effect is captured here too, from the effect itself, with or
// without a dispatcher.
async function dispatchAutomationStudioEffects(initial: AutomationNodeExecutionResult, options: AutomationStudioGraphExecutionOptions, withholding: AutomationStudioTraceWithholding, target: RecordCaptureTarget): Promise<AutomationNodeExecutionResult> {
  let result = initial;
  for (const [index, effect] of (initial.effects ?? []).entries()) {
    // A question for a person is the executor's to raise, not a domain's to
    // answer: no host dispatcher is asked to know what an ask is.
    if (effect.type === AUTOMATION_STUDIO_ASK_EFFECT) continue;
    let dispatched: AutomationNodeExecutionResult;
    if (effect.type === RECORDS_WRITE_EFFECT) {
      const written = await withWrittenRecords(effect, options, target);
      result = { ...result, effects: (result.effects ?? []).map((kept, position) => position === index ? written.effect : kept) };
      dispatched = written.result;
    } else {
      if (!options.effectDispatcher) continue;
      const answer = await options.effectDispatcher(effect, effectDispatchContext(options, withholding)); if (!answer) continue;
      dispatched = await withCapturedRecords(effect, answer, options, target);
    }
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

const PERSIST_FAILED_MESSAGE = "The output ran, but the records it returned could not be saved.";
const WRITE_PERSIST_FAILED_MESSAGE = "The records could not be saved.";

async function withCapturedRecords(
  effect: { type: string; payload?: JsonValue },
  answer: AutomationNodeExecutionResult,
  options: AutomationStudioGraphExecutionOptions,
  target: RecordCaptureTarget
): Promise<AutomationNodeExecutionResult> {
  const { result, batch } = captureAutomationStudioRecordBatch({
    effect,
    dispatched: answer,
    nodeId: target.nodeId,
    attemptId: target.attemptId,
    callFlowAttemptPath: options.callFlowAttemptPath ?? []
  });
  return await withStoredBatch(result, batch, options, target, PERSIST_FAILED_MESSAGE);
}

async function withWrittenRecords(
  effect: { type: string; payload?: JsonValue },
  options: AutomationStudioGraphExecutionOptions,
  target: RecordCaptureTarget
): Promise<{ result: AutomationNodeExecutionResult; effect: { type: string; payload?: JsonValue } }> {
  const written = captureAutomationStudioWrittenRecords({
    effect,
    nodeId: target.nodeId,
    attemptId: target.attemptId,
    callFlowAttemptPath: options.callFlowAttemptPath ?? []
  });
  return { result: await withStoredBatch(written.result, written.batch, options, target, WRITE_PERSIST_FAILED_MESSAGE), effect: written.effect };
}

// The rows are recorded in the run state whether or not the hook stores them,
// so the saved trace holds markers for them either way. A hook that throws
// fails the attempt: rows the Flow declared must be saved are not dropped
// silently. Its error text is not copied into the trace, which keeps no row.
async function withStoredBatch(
  result: AutomationNodeExecutionResult,
  batch: AutomationStudioRecordBatch | undefined,
  options: AutomationStudioGraphExecutionOptions,
  target: RecordCaptureTarget,
  persistFailedMessage: string
): Promise<AutomationNodeExecutionResult> {
  if (!batch) return result;
  let stored: AutomationStudioRunDatasetSummary | undefined;
  try {
    stored = await options.onRecordBatch?.(batch);
  } catch {
    target.runState.records.record(batch);
    return { ...result, status: "failed", route: "failed", message: persistFailedMessage, failure: { category: "action_failed", code: "record_output.persist_failed", retryable: false } };
  }
  target.runState.records.record(batch, stored);
  return result;
}

// A node keeps its place between passes under its own id, for as long as this
// run executes.
function iterationFor(runState: AutomationStudioRunState, nodeId: string): NonNullable<AutomationNodeExecutionContext["iteration"]> {
  return {
    get: () => runState.loops.get(nodeId),
    set: (state) => {
      if (state) runState.loops.set(nodeId, state);
      else runState.loops.delete(nodeId);
    }
  };
}

// The child run a Call Flow attempt starts keys its record batches under this
// attempt, so they never share a key with the parent's or with another
// invocation's.
function callFlowChildOptions(options: AutomationStudioGraphExecutionOptions, attemptId: string): AutomationStudioGraphExecutionOptions {
  return { ...options, callFlowAttemptPath: [...(options.callFlowAttemptPath ?? []), attemptId] };
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
