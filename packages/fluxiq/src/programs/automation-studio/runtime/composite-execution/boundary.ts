// The typed boundary every call crosses (state-aware recovery plan, C1): a Call
// Flow node into a published, version-pinned Flow, and a Call Subflow node into
// a sibling Subflow graph of the same automation. One implementation, so the
// two can never disagree about what crosses.

import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioCallFlowConfiguration, AutomationStudioPublishedFlowSnapshot } from "../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../executor.ts";
import type { AutomationStudioInvocationOptions } from "../executor/frames/index.ts";
import { runAutomationStudioChildWithBounds } from "./child-bounds.ts";

/** What one call hands across its boundary. */
export type AutomationStudioCallBoundaryRequest = {
  /** The callee's declared contract: its interface ports, its declared errors, its own timeout. */
  contract: Pick<AutomationStudioPublishedFlowSnapshot, "interface" | "errors" | "executionDefaults">;
  /** Which parent values fill which callee inputs, and where callee outputs and errors land in the parent. */
  bindings: Omit<AutomationStudioCallFlowConfiguration, "target">;
  /** The parent values a binding may read, by key. Nothing else crosses. */
  callInputs: Record<string, JsonValue>;
  /** The options of the parent attempt the call is made from. */
  parentOptions: AutomationStudioGraphExecutionOptions;
  /** Options the child runs under beyond the parent's, such as the Subflow it is. */
  childOverrides?: Pick<AutomationStudioGraphExecutionOptions, "currentSubflowId">;
  /** How many times the whole child may be run. A container is run once unless its call asks for more. */
  maxAttempts: number;
  /** The child's frame for one run of it, given its bound inputs; `undefined` lets the child frame itself. */
  frame: (childInputs: Record<string, JsonValue>) => AutomationStudioInvocationOptions | undefined;
  /** Runs the child once and returns its saved trace; `executedTrace` reads what it executed with. */
  runChild: (childOptions: AutomationStudioGraphExecutionOptions) => Promise<AutomationStudioGraphExecutionTrace>;
  executedTrace: (saved: AutomationStudioGraphExecutionTrace) => AutomationStudioGraphExecutionTrace;
  /** The text a bound error carries when the child failed without saying why. */
  failedMessage: string;
};

/**
 * Runs a child across a real typed boundary and answers the calling node's
 * result. **No ambient parent value crosses it.** The child's inputs are its
 * declared defaults, overwritten only by what an input binding reads from the
 * parent; its values reach the parent only as its declared interface outputs
 * and its output bindings; a failure reaches the parent as `error.<id>` only
 * when a binding names a declared error, and as `failed` otherwise, with the
 * child frame's own failure record when one names why (its success check).
 *
 * The child runs as a frame of its own (`frame`), under the earlier of the
 * parent's deadline and its own timeout. The frame's `outputs` are set to what
 * the child handed back, by the child's own port ids.
 */
export async function automationStudioCallAcrossBoundary(request: AutomationStudioCallBoundaryRequest): Promise<{ result: AutomationNodeExecutionResult; childTrace: AutomationStudioGraphExecutionTrace }> {
  const { contract, bindings, callInputs, parentOptions } = request;
  const childInputs: Record<string, JsonValue> = {};
  const declaredInputDefaults: Record<string, JsonValue> = {};
  for (const port of contract.interface.inputs) if (port.defaultValue !== undefined) childInputs[port.id] = declaredInputDefaults[port.id] = port.defaultValue;
  for (const binding of bindings.inputBindings ?? []) {
    const value = callInputs[binding.valueKey];
    if (value !== undefined) childInputs[binding.targetPortId] = value;
  }
  const now = parentOptions.now?.() ?? Date.now();
  const ownDeadline = contract.executionDefaults?.timeoutMs ? now + contract.executionDefaults.timeoutMs : undefined;
  const deadlineAt = Math.min(parentOptions.deadlineAt ?? Number.POSITIVE_INFINITY, ownDeadline ?? Number.POSITIVE_INFINITY);
  const boundedDeadline = Number.isFinite(deadlineAt) ? deadlineAt : undefined;
  // A start node belongs to the graph that named it. A child starts at its own
  // start node, so a parent resuming mid-graph never sends its node id across
  // the boundary, where nothing would match it and the child would fail with
  // "No start node is available in this flow." A partial run's stop node is the
  // root's too: a child node sharing its id runs on. And the parent's frame is
  // the parent's: the child runs as a frame of its own.
  const { startNodeId: _parentStartNodeId, stopAfterNodeId: _parentStopAfterNodeId, invocation: _parentInvocation, ...childBase } = parentOptions;
  // The child's defaults come from its declared interface: authored, not supplied (`trace-withholding.ts`, `supply`).
  const childOptions: AutomationStudioGraphExecutionOptions = { ...childBase, ...request.childOverrides, inputs: childInputs, declaredInputDefaults, ...(boundedDeadline !== undefined ? { deadlineAt: boundedDeadline } : {}) };
  let childTrace: AutomationStudioGraphExecutionTrace = { status: "failed", startedAt: now, finishedAt: now, attempts: [], values: {}, effects: [], message: "Child Flow did not execute." };
  let childFrame: AutomationStudioInvocationOptions | undefined;
  for (let attempt = 0; attempt < Math.max(1, request.maxAttempts); attempt += 1) {
    await parentOptions.commandRun?.checkpoint();
    const framed = childFrame = request.frame(childInputs);
    childTrace = await runAutomationStudioChildWithBounds((signal) => request.runChild({ ...childOptions, signal, ...(framed ? { invocation: framed } : {}) }), boundedDeadline, parentOptions.signal, parentOptions.now, parentOptions.commandRun);
    await parentOptions.commandRun?.checkpoint();
    if (childTrace.status === "succeeded" || childTrace.status === "waiting" || childTrace.status === "cancelled") break;
  }
  // The parent executes with what its child executed with. The attempt keeps
  // the child's saved trace.
  await parentOptions.commandRun?.checkpoint();
  const executedChild = request.executedTrace(childTrace);
  const outputs: Record<string, JsonValue> = {};
  const frameOutputs: Record<string, JsonValue> = {};
  for (const port of contract.interface.outputs) outputs[port.id] = frameOutputs[port.id] = executedChild.values[port.id] ?? null;
  for (const binding of bindings.outputBindings ?? []) outputs[binding.valueKey] = frameOutputs[binding.targetPortId] = executedChild.values[binding.targetPortId] ?? null;
  if (childFrame) childFrame.frame.outputs = frameOutputs;
  // A child that handed the run back to a calling frame's checkpoint did not fail with a declared error: nothing is bound for it.
  const declaredFailure = childTrace.status === "failed" && !childTrace.checkpointRoute;
  const errorBinding = declaredFailure ? bindings.errorBindings?.find((binding) => contract.errors.some((error) => error.id === binding.targetPortId)) : undefined;
  if (errorBinding) outputs[errorBinding.valueKey] = executedChild.message ?? request.failedMessage;
  // A frame failure a code names (its success check) is the calling node's failure, so its On Fail paths apply in the parent.
  const failure = childTrace.status === "failed" ? childTrace.failure : undefined;
  return { result: { status: childTrace.status === "succeeded" ? "success" : childTrace.status === "waiting" ? "waiting" : "failed", route: childTrace.status === "succeeded" ? "success" : errorBinding ? `error.${errorBinding.targetPortId}` : "failed", outputs, ...(failure ? { failure } : {}) }, childTrace };
}
