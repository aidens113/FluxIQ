import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import { getAutomationNodeDefinition, resolveAutomationNodeParameterValues } from "../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioLadderRungKind, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { automationStudioCouldNotRun, automationStudioNotShownAttempt, automationStudioStateRouteGuard, decideAutomationStudioStateRoute, type AutomationStudioStateRouteDecision } from "./state-routing/index.ts";
import { nodeAttemptWithAdaptationIds } from "./attempt-trace.ts";
import { chooseAutomationStudioEdge, hasUnvisitedAutomationStudioNodes, missingTargetTrace } from "./graph-navigation.ts";
import { automationStudioFaultFromThrownError, automationStudioThrownErrorText } from "./defensive/index.ts";
import { automationStudioTraceInFrame, runAutomationStudioGraphInFrame } from "./frames/index.ts";
import { executeAutomationStudioNode } from "./node-execution.ts";
import { automationStudioTraceWithSharedInputs } from "./node-execution/index.ts";
import { automationStudioPersonNeededEnding } from "./person-needed.ts";
import type { AutomationStudioCapturedRecords } from "./record-summary.ts";
import { executeWithRegionTimeout, policyDecisionForAttempt, recordRegionTransition } from "./region-execution.ts";
import type { AutomationStudioCarriedIteration } from "../parking/index.ts";
import { automationStudioRunState, type AutomationStudioRunState } from "./run-state.ts";
import { chooseAutomationStudioStartNode } from "./start-node.ts";
import { automationStudioStopAfterNode } from "./partial-run/index.ts";
import {
  automationStudioEndedTrace,
  automationStudioStepArrival,
  automationStudioStepAskOrPark,
  automationStudioStepBeforeNext,
  automationStudioStepCheckpointRoute,
  automationStudioStepEndFrameIncident,
  automationStudioStepEntry,
  automationStudioStepFailedAttempt,
  automationStudioStepFrameSucceeded,
  automationStudioStepLifecycle,
  automationStudioStepLifecycleFrame,
  automationStudioStepLifecycleRegister,
  automationStudioStepRetryBeforeRouting,
  automationStudioStepStateRoute,
  automationStudioTraceWithLifecycle,
  type AutomationStudioStepLifecycleFrame,
  type AutomationStudioStepLifecycleOutcome,
  type AutomationStudioStepLoopContext
} from "./step-loop/index.ts";
import { automationStudioTraceWithholding, automationStudioWithholdRunInputs, type AutomationStudioTraceWithholding } from "./trace-withholding.ts";
import type { FluxIQRuntimeWithheldValues } from "../../../../runtime/index.ts";
import { automationStudioActivityHold, automationStudioActivityLoopWords, automationStudioActivityStepNumbers, emitAutomationStudioActivityStep } from "../activity/index.ts";

/**
 * What each saved trace this module returned withheld by value, keyed by that
 * trace. A Call Flow attempt keeps its child's saved trace while the parent
 * executes with the child's real outputs, so a value the child withheld can
 * reach the parent's own trace -- in an output, or in a failure message the
 * parent binds -- and the parent withholds it as well.
 */
const withheldBySavedTrace = new WeakMap<AutomationStudioGraphExecutionTrace, FluxIQRuntimeWithheldValues>();

/**
 * What each saved trace this module returned captured, keyed by that trace. A
 * Call Flow parent's outputs are its child's real rows, the same arrays and
 * objects, so the parent replaces them with markers as well.
 */
const capturedBySavedTrace = new WeakMap<AutomationStudioGraphExecutionTrace, AutomationStudioCapturedRecords>();

/**
 * The one place a run trace is produced, and therefore the one place values a
 * run resolved out of state are withheld from it.
 *
 * The withholding is applied to the finished trace on the way out rather than
 * stamped onto each attempt as it is built. A stage that hands on an
 * already-clean-looking artifact is what disarms the stage after it, and this
 * stage is the last one that still owns the artifact: what it returns is what
 * `runtime/service.ts` persists. Everything the run *executes* with -- the live
 * `values` map, the effect handed to the dispatcher, the inputs the host is
 * given for its state snapshots -- keeps the real value, because withholding
 * there would break the run rather than the leak.
 *
 * Execution that goes on from a finished run reads real values as well. A caller
 * that does -- a Call Flow parent building its outputs from its child, a
 * live-patch rerun seeded from the attempt that failed -- passes
 * `onExecutedTrace`, which is handed the trace as the run executed it beside the
 * saved trace this returns. The executed trace is for executing with only, and
 * is never to be persisted or published; the saved trace is the one to keep.
 */
export async function runAutomationStudioGraph(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions = {},
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
): Promise<AutomationStudioGraphExecutionTrace> {
  return await runGraphFromSeed(flow, options, undefined, onExecutedTrace);
}

/**
 * What a run that parked on a question had, beyond what its trace holds, so the
 * run that continues it is the same run rather than a second one.
 *
 * `route` is the way out of the parked node the answer chose. The node is not
 * executed again: whatever it already did -- a dispatch, a record capture, a
 * charge -- happened once, and repeating it is the difference between a gate
 * and a dead end.
 */
export type AutomationStudioGraphRunSeed = {
  startedAt: number;
  stepsTaken: number;
  maxSteps: number;
  attempts: AutomationStudioNodeAttemptTrace[];
  values: Record<string, JsonValue>;
  effects: AutomationStudioGraphExecutionTrace["effects"];
  regionTransitions: NonNullable<AutomationStudioGraphExecutionTrace["regionTransitions"]>;
  variables: Record<string, JsonValue>;
  loops: Record<string, AutomationStudioCarriedIteration>;
  route: string;
};

/**
 * Continues a parked run from the seed its park produced. `options.startNodeId`
 * names the parked node, whose outgoing route the seed supplies; `resume.ts`
 * builds both and is the entry point a host calls.
 */
export async function resumeAutomationStudioGraphRun(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  seed: AutomationStudioGraphRunSeed,
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
): Promise<AutomationStudioGraphExecutionTrace> {
  return await runGraphFromSeed(flow, options, seed, onExecutedTrace);
}

/**
 * Runs a graph and returns a trace, whatever happens.
 *
 * **It never rejects.** A throw from anywhere in the run -- the step loop, the
 * question port, the record hook, the withholding rewrite, a host callback -- comes
 * back as a failed trace naming the fault, because a rejection here reaches the
 * run service, ends the session and rethrows: no trace to persist, no attempt row
 * for the node that did it, nothing for a repair to read and nothing for a person
 * to be shown. A run that failed and said why is the worst outcome this function
 * is allowed to have.
 */
async function runGraphFromSeed(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  seed: AutomationStudioGraphRunSeed | undefined,
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
): Promise<AutomationStudioGraphExecutionTrace> {
  const startedAt = seed?.startedAt ?? options.now?.() ?? Date.now();
  try {
    await options.commandRun?.checkpoint();
    // The run executes as its frame, pushed for exactly as long as it runs (`frames/graph-frame.ts`).
    return await runAutomationStudioGraphInFrame(flow, options, runAutomationStudioGraph, (framed) => runGraphToTrace(flow, framed, seed, onExecutedTrace));
  } catch (error) {
    await options.commandRun?.stop("executor.graph_stopped");
    const fault = automationStudioFaultFromThrownError(error, { now: options.now?.() ?? Date.now(), aborted: options.signal?.aborted === true });
    return {
      status: "failed",
      startedAt,
      finishedAt: options.now?.() ?? Date.now(),
      attempts: seed ? [...seed.attempts] : [],
      values: {},
      effects: [],
      message: `The run stopped on an unhandled fault (${fault.code}): ${automationStudioThrownErrorText(error) || "no reason was reported"}.`
    };
  }
}

async function runGraphToTrace(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  seed: AutomationStudioGraphRunSeed | undefined,
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
): Promise<AutomationStudioGraphExecutionTrace> {
  const withholding = automationStudioTraceWithholding();
  const runState = automationStudioRunState(options);
  if (seed) seedRunState(runState, seed);
  // Every run input is run-time data of unknown sensitivity whether or not a
  // binding reads it, and a node may copy one into an output under another key.
  // Recorded before the first node, so every dispatch is told to withhold it too.
  withholding.supply(options.inputs ?? {}, options.declaredInputDefaults);
  recordDeclaredStateBindings(flow, options, withholding);
  // What lifecycle dispatch keeps for this frame's trace: handler bodies' attempts, and the run's records at its root.
  const lifecycle = automationStudioStepLifecycleFrame();
  const start = () => executeAutomationStudioGraph(flow, options, withholding, runState, lifecycle, seed);
  const running = options.commandRun ? options.commandRun.own(start) : start();
  const executed = automationStudioTraceInFrame(await running, options.invocation);
  // The incident still open when the frame ends closes here; a Call Subflow child's goes to its node first (C7).
  automationStudioStepEndFrameIncident(options.invocation, executed);
  await options.commandRun?.checkpoint();
  for (const attempt of executed.attempts) {
    const childWithheld = attempt.childTrace ? withheldBySavedTrace.get(attempt.childTrace) : undefined;
    if (childWithheld) withholding.include(childWithheld);
    const childCaptured = attempt.childTrace ? capturedBySavedTrace.get(attempt.childTrace) : undefined;
    if (childCaptured) runState.records.include(childCaptured);
  }
  // Each value is kept once (`node-execution/shared-inputs.ts`), then rows are replaced, while the trace
  // holds the run's very objects: the rewrites after these copy what they change, found by identity no more.
  // What the run survived rides on the trace, so a host that persists a run
  // persists the faults it absorbed without a store of its own. A fault computed
  // and discarded is the shape of bug this repository keeps meeting.
  // The paces it held nodes to ride beside it: a learned one is what a promotion writes back.
  const defence = runState.defence.summary(), pace = runState.pace.summary();
  const defended = defence || pace ? { ...executed, ...(defence ? { defence } : {}), ...(pace ? { pace } : {}) } : executed;
  const withheld = withholding.apply(automationStudioWithholdRunInputs(runState.records.apply(automationStudioTraceWithSharedInputs(defended, options.inputs ?? {})), options.inputs ?? {}));
  const saved = automationStudioTraceWithLifecycle(withheld, lifecycle, options.invocation);
  withheldBySavedTrace.set(saved, withholding.values());
  capturedBySavedTrace.set(saved, runState.records.captured());
  onExecutedTrace?.(defended, saved);
  return saved;
}

/**
 * Seeds the withholding with whatever the run's own inputs and variables answer
 * for the bindings the document declares, before the first node executes.
 *
 * Without it the trace is protected only from the moment a bound node runs, and
 * a run that fails before that still persists the supplied value: it arrives in
 * `options.inputs`, which is what `values` and every attempt's `inputs` are
 * seeded from. The seed asks the same resolver the executor asks, so what counts
 * as a binding, and how deep one may sit, is decided in one place rather than
 * two.
 */
function recordDeclaredStateBindings(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  withholding: AutomationStudioTraceWithholding
): void {
  const state = { ...(options.inputs ?? {}), ...(options.variables ?? {}) };
  for (const node of flow.nodes) {
    const authored = node.parameterValues ?? {};
    withholding.record(authored, resolveAutomationNodeParameterValues(authored, state).values);
  }
}

/**
 * Puts back what a parked run held only in memory: the variables its nodes
 * wrote and the place each loop had reached. Without it a resumed run reads an
 * empty variable map and starts every list again, which is a restart wearing a
 * resume's clothes.
 *
 * The loop states are checked here rather than where they were carried: the
 * parked record declares their shape structurally to stay clear of a module
 * cycle, and this assignment is where the compiler sees both that shape and
 * `AutomationNodeIterationState` at once.
 */
function seedRunState(runState: AutomationStudioRunState, seed: AutomationStudioGraphRunSeed): void {
  for (const [name, value] of Object.entries(seed.variables)) runState.variables.set(name, value);
  for (const [nodeId, iteration] of Object.entries(seed.loops)) runState.loops.set(nodeId, { items: [...iteration.items], index: iteration.index });
}

/** The most steps one graph run takes, whatever its caller asks and however many steps its loop nodes grant. */
const AUTOMATION_STUDIO_MAX_RUN_STEPS = 100_000;

/**
 * The nodes whose body passes are granted steps of their own -- For Each and
 * Repeat -- keyed by definition id, as `graph-navigation.ts` keys Start and as
 * `state-routing/progress-guard.ts` keys the same two.
 */
const LOOP_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat"]);

/**
 * Each For Each or Repeat pass that routes into its body grants the body
 * `maxStepsPerIteration` more steps, up to the whole-run ceiling, so how long a
 * loop may run is bounded per pass rather than by the run's own limit. Without
 * the allowance, 100 items through a three-node body need 400 steps, past the
 * default 250.
 */
function withIterationAllowance(maxSteps: number, node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): number {
  if (!LOOP_DEFINITION_IDS.has(node.definitionId) || attempt.status !== "succeeded" || attempt.route !== "body") return maxSteps;
  return Math.min(AUTOMATION_STUDIO_MAX_RUN_STEPS, maxSteps + stepsPerIteration(node));
}

/** The authored allowance, which cannot be state-bound, or else the definition's default. */
function stepsPerIteration(node: AutomationStudioFlowNode): number {
  const declared = getAutomationNodeDefinition(node.definitionId)?.parameters.find((parameter) => parameter.id === "maxStepsPerIteration")?.defaultValue;
  for (const candidate of [node.parameterValues?.maxStepsPerIteration, declared]) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 1) return Math.floor(candidate);
  }
  return 1;
}

async function executeAutomationStudioGraph(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  withholding: AutomationStudioTraceWithholding,
  runState: AutomationStudioRunState,
  lifecycle: AutomationStudioStepLifecycleFrame,
  seed?: AutomationStudioGraphRunSeed
): Promise<AutomationStudioGraphExecutionTrace> {
  const now = options.now ?? Date.now;
  const startedAt = seed?.startedAt ?? now();
  const attempts: AutomationStudioNodeAttemptTrace[] = seed ? [...seed.attempts] : [];
  // A resumed run keeps what it had computed, with the caller's own inputs put
  // back over it: the seed comes from a saved trace, whose run inputs are
  // withheld, and a host that supplies them again gets the real ones back.
  const values: Record<string, JsonValue> = seed ? { ...seed.values, ...(options.inputs ?? {}) } : { ...(options.inputs ?? {}) };
  const effects: AutomationStudioGraphExecutionTrace["effects"] = seed ? [...seed.effects] : [];
  const regionTransitions: NonNullable<AutomationStudioGraphExecutionTrace["regionTransitions"]> = seed ? [...seed.regionTransitions] : [];
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  const startChoice = options.startNodeId ? undefined : chooseAutomationStudioStartNode(flow);
  let currentNode = options.startNodeId ? nodesById.get(options.startNodeId) : startChoice?.node;
  if (!currentNode) {
    return {
      status: "failed",
      startedAt,
      finishedAt: now(),
      attempts,
      values,
      effects,
      message: startChoice?.message ?? "No start node is available in this flow."
    };
  }

  // The run's step-to-step state, handed to each seam of the loop (`step-loop/`).
  const ctx: AutomationStudioStepLoopContext = {
    flow, options, withholding, runState, now, startedAt, attempts, values, effects, regionTransitions, nodesById,
    regionStartedAt: new Map<string, number>(),
    capabilities: new Set(options.runtimeCapabilities ?? []),
    // "Step N of M" numbers a step by its place in the Flow, from the Flow's own
    // start, so a retry, a route back or a partial run keeps it; a Merge has none
    // and is not announced (`activity/step/numbers.ts`).
    stepNumbers: automationStudioActivityStepNumbers(flow, (startChoice ?? chooseAutomationStudioStartNode(flow)).node?.id),
    // A do-while pass's step names its page, and the loop's end is said once (`activity/loop/`).
    loopWords: automationStudioActivityLoopWords(flow),
    routeGuard: automationStudioStateRouteGuard(),
    stopAfter: automationStudioStopAfterNode(flow, options.stopAfterNodeId),
    // An attempt's id is its node's id and its number in the run. A re-run of the
    // same run numbers after the attempts its first pass kept, or it would reuse
    // their ids, and the run store keeps the first record under an id it has seen.
    nextAttemptNumber: () => (options.priorAttemptCount ?? 0) + attempts.length + 1,
    stoppedAt: (nodeId, message) => ({ status: "succeeded", startedAt, finishedAt: now(), currentNodeId: nodeId, attempts, values, effects, regionTransitions, stopReason: "stopped_at_node", message }),
    lifecycle,
    maxSteps: seed ? seed.maxSteps : Math.min(AUTOMATION_STUDIO_MAX_RUN_STEPS, Math.max(1, options.maxSteps ?? 250)),
    step: seed?.stepsTaken ?? 0,
    // Reset the moment the run moves to a different node, so a node reached
    // twice -- inside a For Each body, say -- gets the whole ladder again on its
    // second arrival.
    arrival: { nodeId: currentNode.id, attempts: 0, consumed: new Set<AutomationStudioLadderRungKind>(), ordinal: 1 },
    pendingRetry: undefined
  };
  lifecycle.arrivals.set(currentNode.id, 1);
  // The frame's graph joins the run's handler registry as the frame starts (C4).
  automationStudioStepLifecycleRegister(ctx, currentNode.id);
  // On Start, once per new frame: never on a seed, a resume or a run told where to start (C3).
  // Then the frame's entry, unless On Start routed it: an alternative entry whose facts hold, or the default (C2).
  if (!seed && !options.startNodeId) {
    const started = await automationStudioStepLifecycle(ctx, { event: "start", node: currentNode, attemptNumber: 1 });
    if (started.kind === "return") return started.trace;
    if (started.kind === "route") currentNode = started.node;
    else {
      if (started.lifecycle) lifecycle.pending = started.lifecycle;
      currentNode = await automationStudioStepEntry(ctx, currentNode);
    }
  }
  const { stepNumbers, loopWords, stopAfter, stoppedAt } = ctx;
  // Set only on a resumed run's first pass. The parked node is not executed
  // again: that pass does nothing but leave it by the route the answer chose,
  // so whatever the node already did happened once.
  let resumedRoute = seed?.route;
  // The step card's "N of M": M is the Flow's shown nodes, and N leaves out every
  // merge the run has passed, those before a park included, which its attempts
  // carry. A resumed run's first pass only leaves the parked node, which its
  // `stepsTaken` already counted, so it is not a second step either.
  for (let step = seed?.stepsTaken ?? 0; step < ctx.maxSteps; step += 1) {
    ctx.step = step;
    await options.commandRun?.checkpoint();
    if (options.signal?.aborted) return automationStudioEndedTrace(ctx, "cancelled", currentNode.id, "Run cancelled.");
    // A pause holds here, before the node executes, and never inside it. The run resumes at this same node with
    // everything it had computed; the hold and its release are each said once (`activity/hold.ts`).
    const held = options.runControl?.checkpoint({ nodeId: currentNode.id, step });
    if (held) {
      const released = await automationStudioActivityHold(held, { nodeId: currentNode.id, label: currentNode.label, index: stepNumbers.numberOf(currentNode.id), count: stepNumbers.count, byPerson: options.runControl?.heldBy?.() === "person", signal: options.signal });
      await options.commandRun?.checkpoint();
      if (released.outcome === "stop" || options.signal?.aborted) {
        return automationStudioEndedTrace(ctx, "cancelled", currentNode.id, released.outcome === "stop" ? released.message : "Run cancelled.");
      }
    }
    const regionId = options.regionRuntime?.nodeRegionIds[currentNode.id] ?? options.nodeRegionIds?.[currentNode.id];
    const region = options.regionRuntime?.regions.find((candidate) => candidate.id === regionId);
    let route = resumedRoute;
    resumedRoute = undefined;
    if (route === undefined) {
      // The region's checks, the arrival count, the node's pace and its readiness gate (`step-loop/arrival.ts`).
      const arrived = await automationStudioStepArrival(ctx, currentNode, regionId, region);
      if (arrived.kind === "return") return arrived.trace;
      if (arrived.kind === "next") {
        currentNode = arrived.node;
        continue;
      }
      const { remainingMs, retryPolicy, recordedState, paced, readiness } = arrived;
      const node: AutomationStudioFlowNode = currentNode;
      const stepNumber = stepNumbers.numberOf(node.id);
      if (stepNumber !== undefined) emitAutomationStudioActivityStep({ index: stepNumber, count: stepNumbers.count, nodeId: node.id, label: node.label, definitionId: node.definitionId, parameters: node.parameterValues, pass: loopWords.passOf(node.id, attempts) });
      let notShown: AutomationStudioNodeAttemptTrace | undefined = readiness?.satisfied === false && readiness.checkedConditionCount > 0 ? automationStudioNotShownAttempt(node, `${node.id}.attempt.${ctx.nextAttemptNumber()}`, now()) : undefined;
      // On Retry before safe state routing; a handler that cleared the way lets the node run now (`step-loop/could-not-run-retry.ts`).
      const cleared: AutomationStudioStepLifecycleOutcome | undefined = notShown ? (await automationStudioStepRetryBeforeRouting(ctx, { node, attempt: notShown, attemptIndex: undefined, retryPolicy }))?.outcome : undefined;
      if (cleared?.kind === "return") return cleared.trace;
      if (cleared?.kind === "route") {
        currentNode = cleared.node;
        continue;
      }
      if (cleared && cleared.kind !== "pass") notShown = undefined;
      const routing: AutomationStudioStateRouteDecision | undefined = notShown ? await decideAutomationStudioStateRoute({ flow: ctx.flow, node, attempt: notShown, attempts, options, guard: ctx.routeGuard }) : undefined;
      if (!notShown || routing?.kind === "none") runState.pace.started(node, now());
      const executed = notShown && routing?.kind !== "none" ? notShown : remainingMs === undefined
        ? await executeAutomationStudioNode(ctx.flow, node, values, options, ctx.nextAttemptNumber(), withholding, runState)
        : await executeWithRegionTimeout(
          (signal) => executeAutomationStudioNode(ctx.flow, node, values, { ...options, signal }, ctx.nextAttemptNumber(), withholding, runState),
          remainingMs,
          options.signal,
          // Built here, not by the node, so it is stamped here the way node-execution.ts stamps the rest.
          () => nodeAttemptWithAdaptationIds(node, { attemptId: `${node.id}.attempt.${ctx.nextAttemptNumber()}`, nodeId: node.id, definitionId: node.definitionId, startedAt: now(), finishedAt: now(), status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], message: `Region ${regionId} exceeded its ${region!.timeoutMs}ms timeout.`, failure: { category: "timeout", code: "executor.region.timeout", retryable: false, stage: "execution" } }), options.commandRun
        );
      await options.commandRun?.checkpoint();
      // What the ladder and the recorded state contributed is stamped once, here,
      // so every attempt carries it however the node was executed.
      const attempt: AutomationStudioNodeAttemptTrace = {
        ...executed,
        ...(readiness ? { readiness } : {}),
        ...(Object.keys(recordedState).length ? { recordedState } : {}),
        ...(ctx.pendingRetry ? { retry: ctx.pendingRetry } : {}),
        ...(paced ? { pace: paced } : {}),
        ...(routing?.kind === "none" ? { stateRouting: routing.record } : {}),
        ...(lifecycle.pending ? { lifecycle: lifecycle.pending } : {}),
        ...(lifecycle.entry ? { entry: lifecycle.entry } : {})
      };
      ctx.pendingRetry = undefined;
      delete lifecycle.pending;
      delete lifecycle.entry;
      const tracedAttempt = region?.kind === "policy" ? { ...attempt, policyDecision: policyDecisionForAttempt(node, attempt) } : attempt;
      const attemptIndex = attempts.length;
      attempts.push(regionId ? { ...tracedAttempt, regionId } : tracedAttempt);
      // A child that handed the run back to a checkpoint: here, or in a frame that called this one (`step-loop/checkpoint-route.ts`).
      const handedBack = automationStudioStepCheckpointRoute(ctx, node, attemptIndex);
      if (handedBack?.kind === "return") return handedBack.trace;
      if (handedBack?.kind === "next") {
        currentNode = handedBack.node;
        continue;
      }
      ctx.maxSteps = withIterationAllowance(ctx.maxSteps, node, attempt);
      loopWords.settled(attempt, attempts);
      for (const [key, value] of Object.entries(attempt.outputs)) {
        values[`${node.id}.${key}`] = value;
        values[key] = value;
      }
      for (const effect of attempt.effects) effects.push({ ...effect, nodeId: node.id });
      if (options.signal?.aborted) return automationStudioEndedTrace(ctx, "cancelled", node.id, "Run cancelled.");
      // The question the attempt raised, and the wait it asked for (`step-loop/ask-or-park.ts`).
      const asked = await automationStudioStepAskOrPark(ctx, { node, attempt, attemptIndex, stepIndex: step, remainingMs });
      if (asked.kind === "return") return asked.trace;
      let routeOverride = asked.routeOverride;
      // A step that cannot run continues where the page is (`step-loop/state-route.ts`).
      if (routeOverride === undefined && automationStudioCouldNotRun(attempt)) {
        const routed = await automationStudioStepStateRoute(ctx, { node, attempt, attemptIndex, regionId, routing, retryPolicy });
        if (routed.kind === "return") return routed.trace;
        if (routed.kind === "retry") continue;
        if (routed.kind === "next") {
          currentNode = routed.node;
          continue;
        }
      }
      // The fault, the ladder and the way the run goes on from a failure (`step-loop/failed-attempt.ts`).
      if (routeOverride === undefined && attempt.status === "failed") {
        const recovered = await automationStudioStepFailedAttempt(ctx, { node, attempt, attemptIndex, regionId, retryPolicy });
        if (recovered.kind === "return") return recovered.trace;
        if (recovered.kind === "retry") continue;
        if (recovered.kind === "next") {
          currentNode = recovered.node;
          continue;
        }
        routeOverride = recovered.routeOverride;
      }
      route = routeOverride ?? attempt.route ?? "success";
      // Before Next, on a verified success only, before the edge is chosen (`step-loop/before-next.ts`).
      if (routeOverride === undefined && route === "success" && attempt.status === "succeeded" && !attempt.skipped) {
        const onward = await automationStudioStepBeforeNext(ctx, node, attemptIndex);
        if (onward?.kind === "return") return onward.trace;
        if (onward?.kind === "next") {
          currentNode = onward.node;
          continue;
        }
      }
    }

    // The frame's graph as it runs now: an in-run repair may have overlaid a fix on it (`step-loop/incident-repair.ts`).
    const nextEdge = chooseAutomationStudioEdge(ctx.flow, currentNode.id, route, currentNode.definitionId);
    if (!nextEdge) {
      // Stop, or nobody answering, on a person-needed ask the Flow has no failed
      // route for. Checked first: a last node must not "succeed" by it.
      const personEnding = automationStudioPersonNeededEnding(attempts, currentNode, route);
      if (personEnding) return automationStudioEndedTrace(ctx, "failed", currentNode.id, personEnding);
      // The stop node has run: a partial run ends here, whatever edge it lacks.
      const stopsWithoutEdge = stopAfter?.stops({ fromNodeId: currentNode.id, toNodeId: currentNode.id });
      if (stopsWithoutEdge) return stoppedAt(currentNode.id, stopsWithoutEdge);
      const outgoingRoutes = ctx.flow.edges
        .filter((edge) => edge.sourceNodeId === currentNode!.id)
        .map((edge) => edge.sourcePortId ?? "success")
        .filter((candidate, index, routes) => routes.indexOf(candidate) === index);
      // The frame reached its End: its success check, when the graph declares one, decides (`step-loop/success-check.ts`).
      if (currentNode.definitionId === "builtin.control.end" || !outgoingRoutes.length && !hasUnvisitedAutomationStudioNodes(ctx.flow, attempts)) {
        return await automationStudioStepFrameSucceeded(ctx, currentNode.id);
      }
      return automationStudioEndedTrace(ctx, "failed", currentNode.id, outgoingRoutes.length
        ? `Node ${currentNode.id} completed on route ${route}, but no matching outgoing edge exists. Available routes: ${outgoingRoutes.join(", ")}.`
        : `Node ${currentNode.id} completed without an outgoing edge before the Flow visited every node. Add an edge to continue or an End node to finish explicitly.`);
    }
    const stopsOnEdge = stopAfter?.stops({ fromNodeId: currentNode.id, toNodeId: nextEdge.targetNodeId });
    if (stopsOnEdge) return stoppedAt(currentNode.id, stopsOnEdge);
    const previousRegionId = regionId;
    currentNode = ctx.nodesById.get(nextEdge.targetNodeId);
    if (!currentNode) return missingTargetTrace(startedAt, now(), nextEdge, attempts, values, effects);
    recordRegionTransition(nextEdge, previousRegionId, options, regionTransitions, now());
  }

  return automationStudioEndedTrace(ctx, "failed", currentNode.id, `Maximum step count exceeded: ${ctx.maxSteps}.`);
}
