// Call Subflow: a sibling Subflow graph of the same automation, or a saved part
// at the version the step pins, run as a frame of its own (state-aware recovery
// plan, C1). One path for both: a pin is read here into the id its frame runs
// under (`./part-pin.ts`), and everything after this reads that id.

import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioCallFlowConfiguration } from "../../../flows/executable/composite/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { isAutomationNodeParameterStateBinding, resolveAutomationNodeParameterValues, type AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { automationStudioCallAcrossBoundary } from "../composite/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../index.ts";
import { automationStudioNodeOutputReferences } from "../graph-navigation/index.ts";
import { automationStudioChildInvocation } from "./child-frame.ts";
import type { AutomationStudioSubflowGraph } from "./invocation-options.ts";
import { automationStudioLostOutputBinding } from "./lost-output-binding.ts";
import { AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH, automationStudioPartPinOf, automationStudioPinOfSubflowId, automationStudioPinnedSubflowId, type AutomationStudioPartPin } from "./part-pin.ts";

/** What one Call Subflow attempt produced: the node's result, and the child it ran, when it ran one. */
export type AutomationStudioCalledSubflow = {
  result: AutomationNodeExecutionResult;
  childTrace?: AutomationStudioGraphExecutionTrace;
  subflowTarget?: NonNullable<AutomationStudioNodeAttemptTrace["subflowTarget"]>;
};

/** A Subflow that declares nothing: only what the node binds crosses. */
const UNDECLARED_CONTRACT = { interface: { inputs: [], outputs: [] }, errors: [] };

/**
 * Runs the Subflow a Call Subflow node names, across the typed boundary a Call
 * Flow node crosses (`composite-execution/boundary.ts`), as a new frame sharing
 * the run's holder. The child is loaded from `options.subflowGraphs` and run
 * once: its steps keep their own retries, and the container is never re-run
 * whole.
 *
 * The node arrives with its parameters resolved, as every node's are
 * (`../node-execution/attempt.ts`): each `inputs` entry is the value that
 * child input is given, a binding to a parent value already read, so only
 * what the node names crosses and an input bound to a value the parent never
 * produced fails the node before anything runs. A Subflow's declared output
 * that names where it is read from (`metadata.binding`, which a part's
 * `output:` line writes) is read from the child's own values when the child
 * ends.
 *
 * Refused, as a failed result with a plain message and nothing run: a node
 * naming no Subflow, a Subflow already on the frame stack (a call would loop),
 * a run given no Subflows, a Subflow that is not this automation's, and a run
 * with no way to run one. A pin is refused too when it cannot be read, when
 * its version is not in the library (`executor.call_subflow.part_version_missing`),
 * when its source says its own calls cannot run, and when the run's pinned
 * frames are already as deep as calls may go. A step naming both a Subflow and a pin
 * runs the sibling when this automation has it, else the pin.
 */
export async function automationStudioCallSubflow(request: {
  node: AutomationStudioFlowNode;
  options: AutomationStudioGraphExecutionOptions;
}): Promise<AutomationStudioCalledSubflow> {
  const { node, options } = request;
  const call = callSubflowParameters(node.parameterValues ?? {});
  if (call.pinUnreadable) return refused("graph_validation_or_unknown_node", "executor.call_subflow.part_invalid", "This Call Subflow step names a saved part, but not by a part id and a version.");
  const pinnedId = call.pin ? automationStudioPinnedSubflowId(call.pin) : undefined;
  const named = call.subflowId || pinnedId;
  if (!named) return refused("graph_validation_or_unknown_node", "executor.call_subflow.unnamed", "This Call Subflow step does not name a Subflow to run.");
  const invocation = options.invocation;
  if (invocation?.run.stack.some((frame) => frame.subflowId === call.subflowId || frame.subflowId === pinnedId)) {
    return refused("graph_validation_or_unknown_node", "executor.call_subflow.cycle", `Subflow ${named} is already running in this run, so calling it again from inside itself would never end.`);
  }
  const source = options.subflowGraphs;
  if (!source) return refused("missing_router_or_subflow_target", "executor.call_subflow.no_source", `Subflow ${named} could not be run: this run was given no Subflows to call.`);
  // An id a step wrote by hand never reaches the library: only a pin does, so every call into it is one a save could read.
  const sibling = call.subflowId && !automationStudioPinOfSubflowId(call.subflowId) ? await source.load(call.subflowId) : undefined;
  if (!sibling && call.pin) {
    const held = await pinHeldBack(call.pin, options);
    if (held) return held;
  }
  const loaded = sibling ?? (pinnedId ? await source.load(pinnedId) : undefined);
  if (!loaded && call.pin) return refused("missing_router_or_subflow_target", "executor.call_subflow.part_version_missing", `Version ${call.pin.version} of saved part ${call.pin.partId} is not in this project's library, so it was not run.`);
  // A part an in-run repair replaced runs as fixed for the rest of the run (C6 step 8).
  const override = loaded ? invocation?.run.subflowOverrides.get(loaded.subflowId) : undefined;
  // A runner runs the artifact where there is one (`composite-execution/owner.ts`), so the artifact carries the fix too; its interface stays the part's contract.
  const target = loaded && override ? { ...loaded, graph: override, ...(loaded.artifact ? { artifact: { ...loaded.artifact, nodes: override.nodes, edges: override.edges } } : {}) } : loaded;
  if (!target) return refused("missing_router_or_subflow_target", "executor.call_subflow.unknown", `Subflow ${named} could not be run: it is not a Subflow of this automation.`);
  const runSubflow = invocation?.run.runSubflow;
  if (!runSubflow) return refused("missing_router_or_subflow_target", "executor.call_subflow.no_runner", `Subflow ${named} could not be run: this run has no way to run a Subflow.`);
  const executedTraces = new WeakMap<AutomationStudioGraphExecutionTrace, AutomationStudioGraphExecutionTrace>();
  const crossed = await automationStudioCallAcrossBoundary({
    contract: target.artifact ?? UNDECLARED_CONTRACT,
    bindings: call.bindings,
    callInputs: call.inputs,
    parentOptions: options,
    childOverrides: { currentSubflowId: target.subflowId },
    maxAttempts: 1,
    frame: (childInputs) => automationStudioChildInvocation(invocation, { callNodeId: node.id, subflowId: target.subflowId, graph: target.graph, graphRevision: target.graphRevision, inputs: childInputs }),
    runChild: (childOptions) => runSubflow(target, childOptions, (executed, saved) => { executedTraces.set(saved, executed); }),
    executedTrace: (saved) => withDeclaredOutputs(executedTraces.get(saved) ?? saved, target),
    failedMessage: `Subflow ${named} failed.`
  });
  // The child's saved message, which its own withholding already applied, says why; a hand-back to a calling frame's checkpoint is not a failure of it.
  const failed = crossed.result.status === "failed";
  // A child that succeeded cannot answer an output bound to a node key no node of its graph carries (a repair that replaced the part can leave one): a silent `null` would read as an answer, so the call fails and says which.
  const lost = failed || crossed.childTrace.checkpointRoute ? undefined : automationStudioLostOutputBinding(target.graph, target.artifact?.interface.outputs);
  if (lost) {
    return {
      ...refused("graph_validation_or_unknown_node", "executor.call_subflow.output_binding_lost", `Subflow ${named} finished, but its output "${lost.portId}" is read from a step with key "${lost.key}" and no step of the Subflow has that key, so it cannot be answered.`),
      childTrace: crossed.childTrace,
      subflowTarget: { subflowId: target.subflowId, graphFlowId: target.graph.flowId, graphRevision: target.graphRevision }
    };
  }
  const handedBack = crossed.childTrace.checkpointRoute;
  // A saved version that ran with a fix in it is not the version as saved, so a judged end does not stand for it (`./newer-part.ts`). A Flow's own Subflow goes on as it always has.
  const graphRevision = pinnedId && target.subflowId === pinnedId && (override || crossed.childTrace.attempts.some(heldAFix)) ? null : target.graphRevision;
  // A newer version that finished has been tried: a later failure of it, on the next row, is its own.
  if (!failed && !handedBack) invocation?.run.newerPartTrials.delete(target.subflowId);
  const message = handedBack ? `Subflow ${named} handed the run back to checkpoint "${handedBack.checkpointId}".` : crossed.childTrace.message ? `Subflow ${named} failed: ${crossed.childTrace.message}` : `Subflow ${named} failed.`;
  return {
    result: failed ? { ...crossed.result, message } : crossed.result,
    childTrace: crossed.childTrace,
    subflowTarget: { subflowId: target.subflowId, graphFlowId: target.graph.flowId, graphRevision }
  };
}

/** An attempt whose fix the frame kept, here or in a frame it called. */
function heldAFix(attempt: AutomationStudioNodeAttemptTrace): boolean {
  return attempt.repair?.outcome === "held" || (attempt.childTrace?.attempts.some(heldAFix) ?? false);
}

/** Why a pinned part's frame does not start, though its version may be there. */
async function pinHeldBack(pin: AutomationStudioPartPin, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioCalledSubflow | undefined> {
  const pinnedFrames = options.invocation?.run.stack.filter((frame) => automationStudioPinOfSubflowId(frame.subflowId)).length ?? 0;
  if (pinnedFrames >= AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH) return refused("graph_validation_or_unknown_node", "executor.call_subflow.too_deep", `Saved part ${pin.partId} was not run: saved parts may call each other only ${AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH} deep.`);
  const said = await options.subflowGraphs?.pinRefusal?.(pin);
  return said ? refused("graph_validation_or_unknown_node", said.code, said.message) : undefined;
}

function refused(category: "graph_validation_or_unknown_node" | "missing_router_or_subflow_target", code: string, message: string): AutomationStudioCalledSubflow {
  return { result: { status: "failed", route: "failed", outputs: {}, message, failure: { category, code, retryable: false, stage: "dispatch" } } };
}

/**
 * The node's resolved parameters as boundary bindings: `inputs` maps a
 * Subflow input id to the value it is given, which the boundary reads under
 * that same id; `outputs` maps a Subflow output id to the parent key it is
 * kept under, and `errors` a declared error id to the parent key its message
 * is kept under. An `outputs` or `errors` entry that is not a string binds
 * nothing.
 */
function callSubflowParameters(parameters: Record<string, JsonValue>): { subflowId: string; pin?: AutomationStudioPartPin; pinUnreadable?: true; inputs: Record<string, JsonValue>; bindings: Omit<AutomationStudioCallFlowConfiguration, "target"> } {
  const subflowId = typeof parameters.subflowId === "string" ? parameters.subflowId.trim() : "";
  const pin = automationStudioPartPinOf(parameters.part);
  const pinUnreadable = parameters.part !== undefined && parameters.part !== null && !pin;
  const given = parameters.inputs;
  const inputs: Record<string, JsonValue> = given && typeof given === "object" && !Array.isArray(given) ? Object.fromEntries(Object.entries(given).filter(([id]) => id)) : {};
  return {
    subflowId,
    ...(pin ? { pin } : {}),
    ...(pinUnreadable ? { pinUnreadable: true as const } : {}),
    inputs,
    bindings: {
      inputBindings: Object.keys(inputs).map((id) => ({ targetPortId: id, valueKey: id })),
      outputBindings: bindingsOf(parameters.outputs),
      errorBindings: bindingsOf(parameters.errors)
    }
  };
}

/**
 * The child's executed trace with each declared output that names where it is
 * read from (`metadata.binding`, a state binding such as
 * `{"$state":{"path":"$node.s2.text"}}`) set to what that names in the child's
 * values, a node read by its key in the child graph. An output whose binding
 * names nothing the child produced is left as the child's values have it, and
 * so comes back `null` when they have nothing under its id.
 */
function withDeclaredOutputs(executed: AutomationStudioGraphExecutionTrace, target: AutomationStudioSubflowGraph): AutomationStudioGraphExecutionTrace {
  const bound: Record<string, JsonValue> = {};
  for (const port of target.artifact?.interface.outputs ?? []) {
    const binding = port.metadata?.binding;
    if (isAutomationNodeParameterStateBinding(binding)) bound[port.id] = binding;
  }
  if (!Object.keys(bound).length) return executed;
  const read = resolveAutomationNodeParameterValues(automationStudioNodeOutputReferences(target.graph, bound), executed.values).values;
  return { ...executed, values: { ...executed.values, ...read } };
}

function bindingsOf(value: JsonValue | undefined): Array<{ targetPortId: string; valueKey: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([targetPortId, valueKey]) => typeof valueKey === "string" && targetPortId && valueKey ? [{ targetPortId, valueKey }] : []);
}
