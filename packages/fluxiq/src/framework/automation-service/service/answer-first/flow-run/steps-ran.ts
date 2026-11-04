// What a run did, by the step of the draft each thing was (feedback's own folding,
// `../../candidate-trial/executed-steps.ts`, so a retry is one step and a pass of a repeat is not).
//
// **From attempt to draft.** An attempt names a node; the node carries its plan key
// (`metadata.bootstrapSymbolicKey`, `runtime/flow-authoring/bootstrap/adaptation.ts`); the assembly
// says which draft step each plan node was written from (`locator.nodes`, `assemble-draft.ts`). A
// join or loop the routing added was written from none, and a step left out of the plan made no
// node, so neither is listed. A step the assembly put back at the front has a new number in its
// list, so it is read by its id and said by the position it holds in the saved draft.
//
// **Only Core's words.** A failure's message, its expected and actual, a trace's message and a
// node's output can all quote the page, so none is read here but to recognise the engine's own
// bounds. `happened` is Core's sentence for a category or a code.
//
// **It always names a failing step.** Whatever stopped the run (a step, the engine's bound, a
// refusal before anything ran) the attempt has somewhere to carry on from.

import type { AutomationStudioFlowArtifact } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioAttemptSettled } from "../../../../../runtime/adaptation/flow-change/index.ts";
import { automationStudioUnresolvedFailedAttempt } from "../../../../../runtime/adaptation/recovery/index.ts";
import type { AutomationStudioFlowBuildPlan, AutomationStudioFlowBootstrapIssueLocator } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioTrialExecutedSteps, automationStudioTrialFailureHappened } from "../../candidate-trial/index.ts";
import type { AutomationStudioAnswerFirstFlowRunWatch } from "./dispatch-watch.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome, AutomationStudioAnswerFirstFlowRunStep } from "./outcome.ts";

type Ran = Extract<AutomationStudioAnswerFirstFlowRunOutcome, { kind: "ran" }>;
type Placed = { position: number; label?: string; nodeKey: string; nodeId?: string };
type Failing = NonNullable<Ran["failing"]>;
type Watch = Pick<AutomationStudioAnswerFirstFlowRunWatch, "order" | "sentCount" | "askedCount" | "succeededCount">;

const SYMBOLIC_KEY = "bootstrapSymbolicKey";
const DEADLINE = /^Flow execution deadline exceeded\.$/u;
const STEP_BOUND = /^Maximum step count exceeded: \d+\.$/u;

const SAID = Object.freeze({
  deadline: "The run reached the time this Flow is allowed and stopped here.",
  stepBound: "The run took as many steps as it is allowed and stopped here.",
  childDeadline: "A Flow this step calls reached the time it is allowed, so the step did not finish.",
  waiting: "This step stopped for a person's answer, and a saved Flow's run asks nobody part way through.",
  unvisited: "The run reached an end with steps it never ran.",
  unmatchedRoute: "The step chose a way on that leads to no other step.",
  alreadyDone: "This was already done earlier in the task, so it was not done again.",
  absentNotDone: "Its control was not on the page, so the step was skipped and what it does was not done.",
  absent: "Its control was not on the page, so the step was skipped.",
  inState: "Its control already showed the asked state, so it was not pressed.",
  elsewhere: "The page was already at another step, so the run went on from there.",
  notFinished: "The run did not reach the end of the Flow.",
  notStarted: "The saved Flow could not be started, so nothing was done."
});

/** Why nothing ran, by the runner's code (`runAutomationStudioDetachedCandidate`). Every other code reads as `notStarted`. */
const REFUSED: Readonly<Record<string, string>> = Object.freeze({
  "candidate.execution_stale": "The Flow changed while this run was going, so it did not go on.",
  "candidate.execution_plan_invalid": "The saved steps do not make a Flow that can run as they stand, so nothing was done.",
  "candidate.execution_plan_rewritten": "The saved steps do not make a Flow that can run as they stand, so nothing was done.",
  "candidate.routing_state_unavailable": "The page could not be read to choose where the Flow starts, so nothing was done.",
  "candidate.execution_no_route": "No part of the Flow fits the page as it stands, so nothing was done.",
  "candidate.execution_error": "The run stopped on a fault inside Core."
});

export type AutomationStudioAnswerFirstFlowRunEnded = {
  reachedEnd: boolean;
  code?: string | undefined;
  trace?: AutomationStudioGraphExecutionTrace | undefined;
  graph?: AutomationStudioFlowArtifact | undefined;
};

type Input = {
  buildPlan: AutomationStudioFlowBuildPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
  saved: readonly AutomationStudioFlowDraftStep[];
  ended: AutomationStudioAnswerFirstFlowRunEnded;
  watch?: Watch | undefined;
};

/** The run's outcome, by draft step (header). */
export function automationStudioAnswerFirstFlowRunStepsRan(input: Input): Ran {
  const { ended, watch } = input;
  const placed = placedSteps(input);
  const attempts = automationStudioTrialExecutedSteps(ended.trace?.attempts ?? []);
  const steps = placed.map((place): AutomationStudioAnswerFirstFlowRunStep => ({
    position: place.position,
    ...(place.label ? { label: place.label } : {}),
    ...ranOf(attempts.filter((entry) => entry.attempt.nodeId === place.nodeId).map((entry) => entry.attempt), place, watch)
  }));
  if (ended.reachedEnd) return { kind: "ran", reachedEnd: true, steps };
  const failing = failingOf(input, placed, steps);
  const marked = steps.map((step) => step.position === failing.position ? { ...step, ran: "failed" as const, happened: failing.happened } : step);
  return { kind: "ran", reachedEnd: false, steps: marked, failing };
}

/** The steps of the Flow, in draft order, each with its node where the run named a graph. */
function placedSteps(input: Input): Placed[] {
  const nodeIdOf = new Map((input.ended.graph?.nodes ?? []).flatMap((node) => {
    const key = node.metadata?.[SYMBOLIC_KEY];
    return typeof key === "string" ? [[key, node.id] as const] : [];
  }));
  const positionById = new Map(input.saved.flatMap((step) => step.id === undefined ? [] : [[step.id, step.position] as const]));
  const placed: Placed[] = [];
  for (const [subflowIndex, subflow] of input.buildPlan.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const place = input.locator?.nodes[`${subflowIndex}.${nodeIndex}`];
      if (place?.draftStep === undefined) continue;
      const nodeId = nodeIdOf.get(node.key);
      placed.push({
        position: (place.draftStepId !== undefined ? positionById.get(place.draftStepId) : undefined) ?? place.draftStep,
        nodeKey: node.key,
        ...(node.label ? { label: node.label } : {}),
        ...(nodeId ? { nodeId } : {})
      });
    }
  }
  return placed.sort((one, other) => one.position - other.position);
}

function ranOf(attempts: readonly AutomationStudioNodeAttemptTrace[], place: Placed, watch: Watch | undefined): Pick<AutomationStudioAnswerFirstFlowRunStep, "ran" | "happened"> {
  const nodeId = place.nodeId;
  if (!attempts.length) return nodeId && watch && watch.succeededCount(nodeId) > 0 ? { ran: "passed" } : { ran: "not_reached" };
  const last = attempts.at(-1)!;
  if (attempts.every((attempt) => attempt.skipped)) return { ran: "skipped", happened: skippedSaid(last) };
  const settled = automationStudioAttemptSettled(last).status;
  if (settled !== "succeeded") return { ran: "failed", happened: last.failure ? automationStudioTrialFailureHappened(last.failure.category, last.failure.code) : SAID.notFinished };
  // Every call reached the run gate and none got past it.
  if (nodeId && watch && watch.askedCount(nodeId) > 0 && watch.sentCount(nodeId) === 0) return { ran: "skipped", happened: SAID.alreadyDone };
  return { ran: "passed" };
}

function skippedSaid(attempt: AutomationStudioNodeAttemptTrace): string {
  const skipped = attempt.skipped;
  if (skipped?.reason === "already_in_state") return SAID.inState;
  if (skipped?.reason === "target_absent") return skipped.notDone ? SAID.absentNotDone : SAID.absent;
  return SAID.elsewhere;
}

/** Where the run stopped and why, in Core's words (header). */
function failingOf(input: Input, placed: readonly Placed[], steps: readonly AutomationStudioAnswerFirstFlowRunStep[]): Failing {
  const { ended, watch } = input;
  const trace = ended.trace;
  const failed = trace ? automationStudioUnresolvedFailedAttempt(trace.attempts) : undefined;
  const failedPlace = placeAt(placed, failed?.nodeId);
  const bound = trace?.message === undefined ? undefined : DEADLINE.test(trace.message) ? SAID.deadline : STEP_BOUND.test(trace.message) ? SAID.stepBound : undefined;
  const code = failed?.failure?.code ?? trace?.failure?.code ?? ended.code;
  const place = bound
    ? placeAt(placed, trace?.currentNodeId) ?? placeInFlight(placed, watch) ?? failedPlace ?? firstNotReached(placed, steps)
    : failedPlace ?? placeAt(placed, trace?.currentNodeId) ?? placeInFlight(placed, watch) ?? firstNotReached(placed, steps);
  const happened = bound ?? (failed ? attemptSaid(failed) : traceSaid(trace, ended.code));
  // A Flow with no written step does not assemble, so `placed` holds at least one.
  const at = place ?? placed[0]!;
  return { position: at.position, ...(at.label ? { label: at.label } : {}), happened, ...(code ? { code } : {}) };
}

function attemptSaid(attempt: AutomationStudioNodeAttemptTrace): string {
  if (attempt.childTrace?.message !== undefined && DEADLINE.test(attempt.childTrace.message)) return SAID.childDeadline;
  return attempt.failure ? automationStudioTrialFailureHappened(attempt.failure.category, attempt.failure.code) : automationStudioTrialFailureHappened("action_failed");
}

function traceSaid(trace: AutomationStudioGraphExecutionTrace | undefined, code: string | undefined): string {
  if (trace?.status === "waiting") return SAID.waiting;
  if (trace?.failure?.code === "executor.graph.unvisited_nodes") return SAID.unvisited;
  if (trace?.failure?.code === "executor.graph.unmatched_route") return SAID.unmatchedRoute;
  if (trace?.failure) return automationStudioTrialFailureHappened(trace.failure.category, trace.failure.code);
  if (code !== undefined && REFUSED[code]) return REFUSED[code]!;
  return trace?.attempts.length ? SAID.notFinished : SAID.notStarted;
}

function placeAt(placed: readonly Placed[], nodeId: string | undefined): Placed | undefined {
  return nodeId === undefined ? undefined : placed.find((place) => place.nodeId === nodeId);
}

/** The last step a call went out for, where the trace cannot say. */
function placeInFlight(placed: readonly Placed[], watch: Watch | undefined): Placed | undefined {
  for (const nodeId of [...(watch?.order() ?? [])].reverse()) {
    const found = placeAt(placed, nodeId);
    if (found) return found;
  }
  return undefined;
}

function firstNotReached(placed: readonly Placed[], steps: readonly AutomationStudioAnswerFirstFlowRunStep[]): Placed | undefined {
  const step = steps.find((entry) => entry.ran === "not_reached") ?? steps.at(-1);
  return step ? placed.find((place) => place.position === step.position) : undefined;
}
