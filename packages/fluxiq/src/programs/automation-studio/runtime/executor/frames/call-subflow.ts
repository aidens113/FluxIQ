// Call Subflow: a sibling Subflow graph of the same automation, run as a frame
// of its own (state-aware recovery plan, C1).

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioCallFlowConfiguration, AutomationStudioFlowNode } from "../../../model/index.ts";
import { isAutomationNodeParameterStateBinding, resolveAutomationNodeParameterValues, type AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { automationStudioCallAcrossBoundary } from "../../composite-execution/boundary.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioNodeOutputReferences } from "../node-inputs.ts";
import { automationStudioChildInvocation } from "./child-frame.ts";
import type { AutomationStudioSubflowGraph } from "./invocation-options.ts";

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
 * with no way to run one.
 */
export async function automationStudioCallSubflow(request: {
  node: AutomationStudioFlowNode;
  options: AutomationStudioGraphExecutionOptions;
}): Promise<AutomationStudioCalledSubflow> {
  const { node, options } = request;
  const call = callSubflowParameters(node.parameterValues ?? {});
  if (!call.subflowId) return refused("graph_validation_or_unknown_node", "executor.call_subflow.unnamed", "This Call Subflow step does not name a Subflow to run.");
  const invocation = options.invocation;
  if (invocation?.run.stack.some((frame) => frame.subflowId === call.subflowId)) {
    return refused("graph_validation_or_unknown_node", "executor.call_subflow.cycle", `Subflow ${call.subflowId} is already running in this run, so calling it again from inside itself would never end.`);
  }
  if (!options.subflowGraphs) return refused("missing_router_or_subflow_target", "executor.call_subflow.no_source", `Subflow ${call.subflowId} could not be run: this run was given no Subflows to call.`);
  const loaded = await options.subflowGraphs.load(call.subflowId);
  // A part an in-run repair replaced runs as fixed for the rest of the run (C6 step 8).
  const override = loaded ? invocation?.run.subflowOverrides.get(loaded.subflowId) : undefined;
  const target = loaded && override ? { ...loaded, graph: override } : loaded;
  if (!target) return refused("missing_router_or_subflow_target", "executor.call_subflow.unknown", `Subflow ${call.subflowId} could not be run: it is not a Subflow of this automation.`);
  const runSubflow = invocation?.run.runSubflow;
  if (!runSubflow) return refused("missing_router_or_subflow_target", "executor.call_subflow.no_runner", `Subflow ${call.subflowId} could not be run: this run has no way to run a Subflow.`);
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
    failedMessage: `Subflow ${call.subflowId} failed.`
  });
  // The child's saved message, which its own withholding already applied, says why; a hand-back to a calling frame's checkpoint is not a failure of it.
  const failed = crossed.result.status === "failed";
  const handedBack = crossed.childTrace.checkpointRoute;
  const message = handedBack ? `Subflow ${call.subflowId} handed the run back to checkpoint "${handedBack.checkpointId}".` : crossed.childTrace.message ? `Subflow ${call.subflowId} failed: ${crossed.childTrace.message}` : `Subflow ${call.subflowId} failed.`;
  return {
    result: failed ? { ...crossed.result, message } : crossed.result,
    childTrace: crossed.childTrace,
    subflowTarget: { subflowId: target.subflowId, graphFlowId: target.graph.flowId, graphRevision: target.graphRevision }
  };
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
function callSubflowParameters(parameters: Record<string, JsonValue>): { subflowId: string; inputs: Record<string, JsonValue>; bindings: Omit<AutomationStudioCallFlowConfiguration, "target"> } {
  const subflowId = typeof parameters.subflowId === "string" ? parameters.subflowId.trim() : "";
  const given = parameters.inputs;
  const inputs: Record<string, JsonValue> = given && typeof given === "object" && !Array.isArray(given) ? Object.fromEntries(Object.entries(given).filter(([id]) => id)) : {};
  return {
    subflowId,
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
