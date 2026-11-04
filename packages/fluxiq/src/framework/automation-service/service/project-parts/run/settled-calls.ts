// What a part's lasting steps did, each as it happened, in the terms a later run of that
// step would be compared in: the node's own action, what it was sent, and its row
// (`service/answer-first/run-acts/run-gate.ts` reads the same doors the same way). A saved
// trace cannot say this: it withholds what a run resolved out of state, and a called part's
// trace is only ever the saved one.
//
// **It is told as it happens, so a run that stops or breaks still told what it did.** A step
// a web domain runs answers at the output door, and one that acts at its own door answers there.
// What the answer does not say surely happened or surely did not is told as uncertain: the
// side a mistake should fall on is not doing it again.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../components/automation/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import type { ProjectPartStepClasses } from "./step-classes.ts";

const POLICY_OUTPUT_EFFECT = "policy.output.dispatch";
const ROW_PORT = "item";
/** A step that lasts and names no class Core knows: a claim is what makes a call lasting without one. */
const UNNAMED_LASTING_ACT = "a step of a saved part";

/** One lasting step's call, as a later run of the same node would make it. */
export type ProjectPartSettledCall = { actionId: string; parameters: JsonObject; consequences: readonly string[]; row?: JsonObject; instructedAct?: string };
export type ProjectPartSettledOutcome = { effectApplied: boolean; uncertain?: boolean };
export type ProjectPartSettled = (call: ProjectPartSettledCall, outcome: ProjectPartSettledOutcome) => void;

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;

/** `options` with both doors telling `settled` what a lasting step did (header). A call step is not asked: what it calls comes through these doors itself. */
export function projectPartSettledCalls(options: AutomationStudioGraphExecutionOptions, input: { classesOf(node: AutomationStudioFlowNode): ProjectPartStepClasses; settled: ProjectPartSettled }): AutomationStudioGraphExecutionOptions {
  /** A lasting step's call whose output has yet to go out. */
  let awaiting: ProjectPartSettledCall | undefined;
  const watched: AutomationStudioGraphExecutionOptions = { ...options };
  const native = options.nativeNodeExecutor;
  if (native) watched.nativeNodeExecutor = (async (request) => {
    awaiting = undefined;
    const classes = input.classesOf(request.node);
    const call = classes.lasting ? callOf(request.node, request.inputs, classes) : undefined;
    let execution: Awaited<ReturnType<Native>>;
    try {
      execution = await native(request);
    } catch (error) {
      if (call) input.settled(call, { effectApplied: false, uncertain: true });
      throw error;
    }
    if (!call) return execution;
    if ((execution?.result.effects ?? []).some((effect) => effect.type === POLICY_OUTPUT_EFFECT)) awaiting = call;
    else input.settled(call, outcomeOf(execution?.result));
    return execution;
  }) as Native;
  const dispatcher = options.effectDispatcher;
  if (dispatcher) watched.effectDispatcher = (async (effect, context) => {
    const call = effect.type === POLICY_OUTPUT_EFFECT ? awaiting : undefined;
    if (!call) return await dispatcher(effect, context);
    awaiting = undefined;
    try {
      const answer = await dispatcher(effect, context);
      input.settled(call, outcomeOf(answer));
      return answer;
    } catch (error) {
      input.settled(call, { effectApplied: false, uncertain: true });
      throw error;
    }
  }) as Dispatcher;
  return watched;
}

function callOf(node: AutomationStudioFlowNode, inputs: Readonly<Record<string, JsonValue>>, classes: ProjectPartStepClasses): ProjectPartSettledCall {
  const row = recordOf(inputs[ROW_PORT]);
  return {
    actionId: node.definitionId,
    parameters: structuredClone(node.parameterValues ?? {}),
    consequences: classes.classes,
    ...(row ? { row: structuredClone(row) } : {}),
    ...(classes.classes.length ? {} : { instructedAct: UNNAMED_LASTING_ACT })
  };
}

function outcomeOf(result: AutomationNodeExecutionResult | undefined): ProjectPartSettledOutcome {
  if (result?.status === "success") return { effectApplied: true };
  return result?.failure?.effect === "unacted" ? { effectApplied: false } : { effectApplied: false, uncertain: true };
}

function recordOf(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
