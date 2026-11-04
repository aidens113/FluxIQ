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
//
// **Inside a task's attempt the same door asks first** (`admit`), so an act the task already did by
// hand, or that may have landed, stops the part with nothing pressed. Here and not in the gate before
// it, because this is where a step's values are resolved: what the record was told, and what it holds
// from a hand's act, is the step as it ran, and a gate reading the saved step's bindings would be
// comparing another thing and let the repeat through. The count a person asked for is the record's own
// to apply. A person's own run names no `admit`, and is asked nothing.
//
// **A step that says it causes nothing lasting claims no act.** Typing a search and sending it is a
// commit by its node's kind, so the gate looks at the page first, but `consequences: none` is the
// author's word for what it does. The record keeps it as a press that declared nothing (its own
// disclosed limit), so a first real run still sends the search, rather than skipping it and pressing
// whatever rows the page shows without it.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../components/automation/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "../../../../../engine/automation/defensive/index.ts";
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
/** Whether a record of a task's acts lets this call go: the same call `ProjectPartSettled` is told, so the two compare alike (header). */
export type ProjectPartAdmit = (call: ProjectPartSettledCall) => "run" | "already_done" | "look_first";

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;

/** What a step the record held back answers: nothing was done, and the gate has already been told to stop the run (header). */
const HELD: AutomationNodeExecutionResult = { status: "failed", route: "failed", outputs: {}, message: "This step was not done: it already happened in this task, or may have.", failure: { category: "action_failed", code: "part.act_on_record", retryable: false, stage: "dispatch", effect: "unacted" } };

/**
 * `options` with both doors telling `settled` what a lasting step did, and asking `admit` before one goes (header).
 * `held` is told the step `admit` kept back. A call step is not asked: what it calls comes through these doors itself.
 */
export function projectPartSettledCalls(options: AutomationStudioGraphExecutionOptions, input: {
  classesOf(node: AutomationStudioFlowNode): ProjectPartStepClasses;
  settled?: ProjectPartSettled | undefined;
  admit?: ProjectPartAdmit | undefined;
  held?: ((node: AutomationStudioFlowNode, answer: "already_done" | "look_first") => void) | undefined;
}): AutomationStudioGraphExecutionOptions {
  /** A lasting step's call whose output has yet to go out. */
  let awaiting: ProjectPartSettledCall | undefined;
  const watched: AutomationStudioGraphExecutionOptions = { ...options };
  const native = options.nativeNodeExecutor;
  if (native) watched.nativeNodeExecutor = (async (request) => {
    awaiting = undefined;
    const classes = input.classesOf(request.node);
    const call = classes.lasting ? projectPartStepCall(request.node, request.inputs[ROW_PORT], classes) : undefined;
    const admitted = call ? input.admit?.(call) ?? "run" : "run";
    if (admitted !== "run") {
      input.held?.(request.node, admitted);
      return { result: structuredClone(HELD) };
    }
    let execution: Awaited<ReturnType<Native>>;
    try {
      execution = await native(request);
    } catch (error) {
      if (call) input.settled?.(call, { effectApplied: false, uncertain: true });
      throw error;
    }
    if (!call) return execution;
    if ((execution?.result.effects ?? []).some((effect) => effect.type === POLICY_OUTPUT_EFFECT)) awaiting = call;
    else input.settled?.(call, outcomeOf(execution?.result));
    return execution;
  }) as Native;
  const dispatcher = options.effectDispatcher;
  if (dispatcher) watched.effectDispatcher = (async (effect, context) => {
    const call = effect.type === POLICY_OUTPUT_EFFECT ? awaiting : undefined;
    if (!call) return await dispatcher(effect, context);
    awaiting = undefined;
    try {
      const answer = await dispatcher(effect, context);
      input.settled?.(call, outcomeOf(answer));
      return answer;
    } catch (error) {
      input.settled?.(call, { effectApplied: false, uncertain: true });
      throw error;
    }
  }) as Dispatcher;
  return watched;
}

/** A lasting step's call, by its node's own action and parameters, and the row it is handed. */
function projectPartStepCall(node: AutomationStudioFlowNode, handedRow: JsonValue | undefined, classes: ProjectPartStepClasses): ProjectPartSettledCall {
  const row = recordOf(handedRow);
  return {
    actionId: node.definitionId,
    parameters: structuredClone(node.parameterValues ?? {}),
    consequences: classes.classes,
    ...(row ? { row: structuredClone(row) } : {}),
    ...(classes.classes.length || saidNothingLasts(node) ? {} : { instructedAct: UNNAMED_LASTING_ACT })
  };
}

/** Whether the step's own declaration is that it causes nothing lasting (header). */
function saidNothingLasts(node: AutomationStudioFlowNode): boolean {
  const declared = node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  return Array.isArray(declared) && declared.length === 0;
}

function outcomeOf(result: AutomationNodeExecutionResult | undefined): ProjectPartSettledOutcome {
  if (result?.status === "success") return { effectApplied: true };
  return result?.failure?.effect === "unacted" ? { effectApplied: false } : { effectApplied: false, uncertain: true };
}

function recordOf(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
