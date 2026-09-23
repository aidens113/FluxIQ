import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import { getAutomationNodeDefinition, resolveAutomationNodeParameterValues } from "../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioLadderRungKind, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { nodeAttemptWithAdaptationIds } from "./attempt-trace.ts";
import { chooseAutomationStudioEdge, hasUnvisitedAutomationStudioNodes, missingTargetTrace } from "./graph-navigation.ts";
import { automationStudioAwaitNodeReadiness, runAutomationStudioRecoveryLadder } from "./ladder-run.ts";
import { executeAutomationStudioNode } from "./node-execution.ts";
import { automationStudioRecordedState } from "./recorded-state.ts";
import { recoveryBudgetState } from "./recovery-budget.ts";
import { failureMessageForRecoveryStop } from "./recovery-ladder.ts";
import { automationStudioNodeRetryPolicy } from "./retry-policy.ts";
import type { AutomationStudioCapturedRecords } from "./record-summary.ts";
import { executeWithRegionTimeout, policyDecisionForAttempt, recordRegionTransition } from "./region-execution.ts";
import { automationStudioParkedRun, automationStudioAskInEffects, automationStudioAskSettlement, type AutomationStudioAsk, type AutomationStudioAskSettlement, type AutomationStudioCarriedIteration, type AutomationStudioParkedRun } from "../parking/index.ts";
import { automationStudioRunState, type AutomationStudioRunState } from "./run-state.ts";
import { chooseAutomationStudioStartNode } from "./start-node.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, automationStudioTraceWithholding, type AutomationStudioTraceWithholding } from "./trace-withholding.ts";
import type { FluxIQRuntimeWithheldValues } from "../../../../runtime/index.ts";

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

async function runGraphFromSeed(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  seed: AutomationStudioGraphRunSeed | undefined,
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
): Promise<AutomationStudioGraphExecutionTrace> {
  const withholding = automationStudioTraceWithholding();
  const runState = automationStudioRunState(options);
  if (seed) seedRunState(runState, seed);
  recordDeclaredStateBindings(flow, options, withholding);
  const executed = await executeAutomationStudioGraph(flow, options, withholding, runState, seed);
  for (const attempt of executed.attempts) {
    const childWithheld = attempt.childTrace ? withheldBySavedTrace.get(attempt.childTrace) : undefined;
    if (childWithheld) withholding.include(childWithheld);
    const childCaptured = attempt.childTrace ? capturedBySavedTrace.get(attempt.childTrace) : undefined;
    if (childCaptured) runState.records.include(childCaptured);
  }
  // Rows are replaced first, while the trace still holds the very arrays and
  // objects capture produced: the rewrites after this one copy what they change,
  // and a copy can no longer be found by identity.
  const saved = withholding.apply(withholdRunInputs(runState.records.apply(executed), options.inputs ?? {}));
  withheldBySavedTrace.set(saved, withholding.values());
  capturedBySavedTrace.set(saved, runState.records.captured());
  onExecutedTrace?.(executed, saved);
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

/** The most steps one graph run takes, whatever its caller asks and however many steps its For Each nodes grant. */
const AUTOMATION_STUDIO_MAX_RUN_STEPS = 100_000;

/** The node whose body passes are granted steps of their own; keyed by definition id, as `graph-navigation.ts` keys Start. */
const FOR_EACH_DEFINITION_ID = "builtin.control.for-each";

/**
 * Each For Each pass that routes into its body grants the body
 * `maxStepsPerIteration` more steps, up to the whole-run ceiling, so how long a
 * list may run is bounded per item rather than by the run's own limit. Without
 * the allowance, 100 items through a three-node body need 400 steps, past the
 * default 250.
 */
function withIterationAllowance(maxSteps: number, node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): number {
  if (node.definitionId !== FOR_EACH_DEFINITION_ID || attempt.status !== "succeeded" || attempt.route !== "body") return maxSteps;
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

/**
 * The wait between two attempts of the same node.
 *
 * A caller may supply its own `delay`, so a test or a simulator spends no wall
 * clock on a backoff. The default timer is unreferenced: a backoff must never
 * be the reason a process stays alive.
 */
async function automationStudioRetryDelay(options: AutomationStudioGraphExecutionOptions, backoffMs: number): Promise<void> {
  if (backoffMs <= 0) return;
  if (options.delay) {
    await options.delay(backoffMs, options.signal);
    return;
  }
  await new Promise<void>((resolve) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(resolve, backoffMs);
    (timer as { unref?: () => void }).unref?.();
  });
}

/** How deep a withheld input is walked before it is withheld whole: the bound the value-based rewrite uses. */
const MAXIMUM_INPUT_DEPTH = 64;

/**
 * The trace with every run input withheld where this module saved it: in
 * `values`, and in each attempt's `inputs`, both seeded from `options.inputs`.
 *
 * A run input is run-time data of unknown sensitivity whether or not a node reads
 * it, but only an input a binding resolved is recorded for the value-based
 * rewrite, so one no binding reads was saved here in clear. It is found by
 * position and proved by identity: the entry still holds the value the caller
 * supplied, not a node output written over the same key.
 *
 * Not by value. A value the run computed can equal an input (5 + 0), and
 * withholding every equal value would make the saved trace misreport what the
 * run computed. The cost is a known gap: an input no binding reads, copied by a
 * node into an output under another key, stays in clear at that copy. Nothing
 * executes from this copy -- a Call Flow parent and a live-patch rerun are handed
 * the executed trace -- so the choice shapes only what is kept. A withheld input
 * keeps its shape, as everything else the trace withholds does.
 */
function withholdRunInputs(trace: AutomationStudioGraphExecutionTrace, inputs: Record<string, JsonValue>): AutomationStudioGraphExecutionTrace {
  if (!Object.keys(inputs).length) return trace;
  return {
    ...trace,
    values: withheldInputEntries(trace.values, inputs),
    attempts: trace.attempts.map((attempt) => {
      const attemptInputs = withheldInputEntries(attempt.inputs, inputs);
      return attemptInputs === attempt.inputs ? attempt : { ...attempt, inputs: attemptInputs };
    })
  };
}

function withheldInputEntries(entries: Record<string, JsonValue>, inputs: Record<string, JsonValue>): Record<string, JsonValue> {
  let withheld: Record<string, JsonValue> | undefined;
  for (const [key, supplied] of Object.entries(inputs)) {
    if (entries[key] !== supplied) continue;
    withheld ??= { ...entries };
    withheld[key] = withheldInputValue(supplied, 0);
  }
  return withheld ?? entries;
}

/** Every string and number in a supplied value, replaced in place. Booleans and null carry no credential and stay, as in the value-based rewrite. */
function withheldInputValue(value: JsonValue, depth: number): JsonValue {
  if (typeof value === "string") return value ? AUTOMATION_STUDIO_WITHHELD_VALUE : value;
  if (typeof value === "number") return AUTOMATION_STUDIO_WITHHELD_VALUE;
  if (!value || typeof value !== "object") return value;
  if (depth >= MAXIMUM_INPUT_DEPTH) return AUTOMATION_STUDIO_WITHHELD_VALUE;
  if (Array.isArray(value)) return value.map((item) => withheldInputValue(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withheldInputValue(item, depth + 1)]));
}

async function executeAutomationStudioGraph(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  withholding: AutomationStudioTraceWithholding,
  runState: AutomationStudioRunState,
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
  const regionStartedAt = new Map<string, number>();
  const capabilities = new Set(options.runtimeCapabilities ?? []);
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

  let maxSteps = seed ? seed.maxSteps : Math.min(AUTOMATION_STUDIO_MAX_RUN_STEPS, Math.max(1, options.maxSteps ?? 250));
  // One arrival at one node: how many times it has been attempted here, and
  // which ladder rungs that arrival has already spent. It is reset the moment
  // the run moves to a different node, so a node reached twice -- inside a For
  // Each body, say -- gets the whole ladder again on its second arrival.
  let arrival = { nodeId: currentNode.id, attempts: 0, consumed: new Set<AutomationStudioLadderRungKind>() };
  let pendingRetry: AutomationStudioNodeAttemptTrace["retry"];
  // Set only on a resumed run's first pass. The parked node is not executed
  // again: that pass does nothing but leave it by the route the answer chose,
  // so whatever the node already did happened once.
  let resumedRoute = seed?.route;
  for (let step = seed?.stepsTaken ?? 0; step < maxSteps; step += 1) {
    if (options.signal?.aborted) {
      return { status: "cancelled", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: "Run cancelled." };
    }
    const regionId = options.regionRuntime?.nodeRegionIds[currentNode.id] ?? options.nodeRegionIds?.[currentNode.id];
    const region = options.regionRuntime?.regions.find((candidate) => candidate.id === regionId);
    let route = resumedRoute;
    resumedRoute = undefined;
    if (route === undefined) {
      if (regionId && !regionStartedAt.has(regionId)) regionStartedAt.set(regionId, now());
      const missingCapability = region?.requiredRuntimeCapabilities?.find((capability) => !capabilities.has(capability));
      if (missingCapability) return { status: "failed", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: `Region ${regionId} requires runtime capability ${missingCapability}.` };
      const elapsed = region?.timeoutMs === undefined ? 0 : now() - (regionStartedAt.get(regionId!) ?? now());
      if (region?.timeoutMs !== undefined && elapsed >= region.timeoutMs) return { status: "failed", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: `Region ${regionId} exceeded its ${region.timeoutMs}ms timeout.` };
      const remainingMs = region?.timeoutMs === undefined ? undefined : region.timeoutMs - elapsed;
      if (arrival.nodeId !== currentNode.id) arrival = { nodeId: currentNode.id, attempts: 0, consumed: new Set<AutomationStudioLadderRungKind>() };
      arrival.attempts += 1;
      const retryPolicy = automationStudioNodeRetryPolicy(flow, currentNode, options);
      const recordedState = automationStudioRecordedState(currentNode);
      // The wait ceiling, gated by the state the node expects to find. It never
      // fails the node: an unsatisfied gate is a mark on the attempt, because the
      // recording is evidence the action was possible at that point.
      const readiness = await automationStudioAwaitNodeReadiness(currentNode, options, `${currentNode.id}.attempt.${attempts.length + 1}`);
      if (options.signal?.aborted) {
        return { status: "cancelled", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: "Run cancelled." };
      }
      const executed = remainingMs === undefined
        ? await executeAutomationStudioNode(flow, currentNode, values, options, attempts.length + 1, withholding, runState)
        : await executeWithRegionTimeout(
          (signal) => executeAutomationStudioNode(flow, currentNode!, values, { ...options, signal }, attempts.length + 1, withholding, runState),
          remainingMs,
          options.signal,
          // Built here, not by the node, so it is stamped here the way node-execution.ts stamps the rest.
          () => nodeAttemptWithAdaptationIds(currentNode!, { attemptId: `${currentNode!.id}.attempt.${attempts.length + 1}`, nodeId: currentNode!.id, definitionId: currentNode!.definitionId, startedAt: now(), finishedAt: now(), status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], message: `Region ${regionId} exceeded its ${region!.timeoutMs}ms timeout.` })
        );
      // What the ladder and the recorded state contributed is stamped once, here,
      // so every attempt carries it however the node was executed.
      const attempt: AutomationStudioNodeAttemptTrace = {
        ...executed,
        ...(readiness ? { readiness } : {}),
        ...(Object.keys(recordedState).length ? { recordedState } : {}),
        ...(pendingRetry ? { retry: pendingRetry } : {})
      };
      pendingRetry = undefined;
      const tracedAttempt = region?.kind === "policy" ? { ...attempt, policyDecision: policyDecisionForAttempt(currentNode, attempt) } : attempt;
      const attemptIndex = attempts.length;
      attempts.push(regionId ? { ...tracedAttempt, regionId } : tracedAttempt);
      maxSteps = withIterationAllowance(maxSteps, currentNode, attempt);
      for (const [key, value] of Object.entries(attempt.outputs)) {
        values[`${currentNode.id}.${key}`] = value;
        values[key] = value;
      }
      for (const effect of attempt.effects) effects.push({ ...effect, nodeId: currentNode.id });
      if (options.signal?.aborted) return { status: "cancelled", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: "Run cancelled." };
      // The question the attempt raised, from wherever inside it -- the node, a
      // domain answering a dispatch, a gate. It is read here rather than at the
      // node, which is what makes asking a property of a run and not of one node
      // definition.
      const ask = automationStudioAskInEffects(attempt.effects, {
        askId: attempt.attemptId,
        stage: "execution",
        nodeId: currentNode.id,
        definitionId: currentNode.definitionId,
        attemptId: attempt.attemptId
      });
      let routeOverride: string | undefined;
      if (ask) {
        const parked = automationStudioParkedRun({
          ask,
          nodeId: currentNode.id,
          definitionId: currentNode.definitionId,
          attemptId: attempt.attemptId,
          parkedAtMs: now(),
          carried: {
            variables: Object.fromEntries(runState.variables),
            loops: Object.fromEntries(runState.loops),
            stepsTaken: step + 1,
            maxSteps,
            ...(options.callFlowAttemptPath?.length ? { callFlowAttemptPath: [...options.callFlowAttemptPath] } : {})
          }
        });
        attempts[attemptIndex] = { ...attempts[attemptIndex]!, ask: { askId: ask.askId, kind: ask.kind, parks: ask.parks, status: "pending" } };
        const undelivered = await openAutomationStudioAsk(options, ask);
        if (undelivered) {
          return { status: "failed", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: undelivered };
        }
        if (ask.parks) {
          const settlement = await settleAskInPlace(options, parked);
          if (!settlement) {
            return { status: "waiting", startedAt, currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, parked, ...(attempt.message ? { message: attempt.message } : {}) };
          }
          if (settlement.outcome === "refused") {
            return { status: "failed", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: settlement.message };
          }
          attempts[attemptIndex] = { ...attempts[attemptIndex]!, ask: settledAskRecord(ask, settlement) };
          // What the person said is data the rest of the Flow can read, put
          // where every other node output goes so a binding reaches it the
          // ordinary way.
          if (settlement.outcome === "answered" && settlement.answer.value !== null) {
            values[`${currentNode.id}.answer`] = settlement.answer.value;
            values.answer = settlement.answer.value;
          }
          routeOverride = settlement.route;
        }
      }
      if (routeOverride === undefined && attempt.status === "waiting") {
        return {
          status: "waiting",
          startedAt,
          currentNodeId: currentNode.id,
          attempts,
          values,
          effects, regionTransitions,
          ...(attempt.message ? { message: attempt.message } : {})
        };
      }
      if (routeOverride === undefined && attempt.status === "failed") {
        const failedEdge = chooseAutomationStudioEdge(flow, currentNode.id, attempt.route ?? "failed");
        const failedNode = currentNode;
        const ladder = await runAutomationStudioRecoveryLadder({
          flow,
          node: failedNode,
          attempt: attempts[attemptIndex]!,
          failedEdge,
          options,
          budgetState: recoveryBudgetState(attempts, attemptIndex, failedNode.id, options.currentSubflowId),
          policy: retryPolicy,
          attemptsForNode: arrival.attempts,
          consumed: arrival.consumed,
          executeNode: async (interference) => {
            const cleared = await executeAutomationStudioNode(flow, interference, values, options, attempts.length + 1, withholding, runState);
            attempts.push(regionId ? { ...cleared, regionId } : cleared);
            for (const [key, value] of Object.entries(cleared.outputs)) {
              values[`${interference.id}.${key}`] = value;
              values[key] = value;
            }
            for (const effect of cleared.effects) effects.push({ ...effect, nodeId: interference.id });
            return cleared;
          }
        });
        const recoveryDecision = ladder.decision;
        attempts[attemptIndex] = {
          ...attempts[attemptIndex]!,
          recoveryDecision
        };
        if (ladder.kind === "retry") {
          pendingRetry = { attemptNumber: arrival.attempts + 1, maxAttempts: retryPolicy.maxAttempts, backoffMs: ladder.backoffMs, rung: ladder.rung, previousAttemptId: attempt.attemptId };
          await automationStudioRetryDelay(options, ladder.backoffMs);
          if (options.signal?.aborted) return { status: "cancelled", startedAt, finishedAt: now(), currentNodeId: failedNode.id, attempts, values, effects, regionTransitions, message: "Run cancelled." };
          continue;
        }
        if (ladder.kind === "satisfied") {
          // The state the node was recorded to produce already holds, so the run
          // carries on down the success route rather than repeating an action
          // that has already happened. The attempt keeps its own failed status:
          // what happened and what the ladder made of it are two facts, not one.
          routeOverride = "success";
        } else {
          const executableFailedEdge = recoveryDecision.selected?.kind === "deterministic_path" && recoveryDecision.selected.edgeId === failedEdge?.id ? failedEdge : null;
          if (!executableFailedEdge) {
            const recoveryStopMessage = failureMessageForRecoveryStop(recoveryDecision, attempt);
            return {
              status: "failed",
              startedAt,
              finishedAt: now(),
              currentNodeId: failedNode.id,
              attempts,
              values,
              effects, regionTransitions,
              ...(recoveryStopMessage ? { message: recoveryStopMessage } : {})
            };
          }
          currentNode = nodesById.get(executableFailedEdge.targetNodeId);
          if (!currentNode) return missingTargetTrace(startedAt, now(), executableFailedEdge, attempts, values, effects);
          recordRegionTransition(executableFailedEdge, regionId, options, regionTransitions, now());
          continue;
        }
      }
      route = routeOverride ?? attempt.route ?? "success";
    }

    const nextEdge = chooseAutomationStudioEdge(flow, currentNode.id, route, currentNode.definitionId);
    if (!nextEdge) {
      const outgoingRoutes = flow.edges
        .filter((edge) => edge.sourceNodeId === currentNode!.id)
        .map((edge) => edge.sourcePortId ?? "success")
        .filter((candidate, index, routes) => routes.indexOf(candidate) === index);
      if (currentNode.definitionId === "builtin.control.end" || !outgoingRoutes.length && !hasUnvisitedAutomationStudioNodes(flow, attempts)) {
        return { status: "succeeded", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions };
      }
      return {
        status: "failed",
        startedAt,
        finishedAt: now(),
        currentNodeId: currentNode.id,
        attempts,
        values,
        effects,
        regionTransitions,
        message: outgoingRoutes.length
          ? `Node ${currentNode.id} completed on route ${route}, but no matching outgoing edge exists. Available routes: ${outgoingRoutes.join(", ")}.`
          : `Node ${currentNode.id} completed without an outgoing edge before the Flow visited every node. Add an edge to continue or an End node to finish explicitly.`
      };
    }
    const previousRegionId = regionId;
    currentNode = nodesById.get(nextEdge.targetNodeId);
    if (!currentNode) return missingTargetTrace(startedAt, now(), nextEdge, attempts, values, effects);
    recordRegionTransition(nextEdge, previousRegionId, options, regionTransitions, now());
  }

  return {
    status: "failed",
    startedAt,
    finishedAt: now(),
    currentNodeId: currentNode.id,
    attempts,
    values,
    effects, regionTransitions,
    message: `Maximum step count exceeded: ${maxSteps}.`
  };
}

/**
 * Puts the ask where a person will see it. Returns the failure message when
 * nobody could be told, and nothing when the ask was opened or no port is bound.
 *
 * A port that throws fails the run rather than parking it. The product's rule
 * is that a blocked action reaches the person, and a run left waiting on a
 * question that was never delivered is exactly the silent refusal that rule
 * exists to stop. With no port bound at all the run still parks and is still
 * resumable by whoever holds its trace: a host that has not wired a
 * conversation up yet should not have its runs fail for asking.
 */
async function openAutomationStudioAsk(options: AutomationStudioGraphExecutionOptions, ask: AutomationStudioAsk): Promise<string | undefined> {
  if (!options.parking) return undefined;
  try {
    await options.parking.open(ask);
    return undefined;
  } catch {
    return `Run stopped: it needed to ask a person something (${ask.askId}), and the question could not be delivered.`;
  }
}

/**
 * Waits for the answer without returning from the run, for a port that can hold
 * one open. Nothing back means this run parks instead and is resumed from its
 * trace later, which is the shape that survives a restart.
 */
async function settleAskInPlace(options: AutomationStudioGraphExecutionOptions, parked: AutomationStudioParkedRun): Promise<AutomationStudioAskSettlement | undefined> {
  const port = options.parking;
  if (!port?.awaitAnswer) return undefined;
  const answer = await port.awaitAnswer(parked.ask, {
    ...(parked.expiresAtMs !== undefined ? { expiresAtMs: parked.expiresAtMs } : {}),
    ...(options.signal ? { signal: options.signal } : {})
  });
  // A port that waited as long as it was told and came back with nothing has
  // established the expiry by having waited, so no clock is consulted here.
  return automationStudioAskSettlement(parked, answer, options.now?.() ?? Date.now());
}

/** What the attempt records once its ask is settled: how it ended, and the way the run left the node. */
function settledAskRecord(ask: AutomationStudioAsk, settlement: Extract<AutomationStudioAskSettlement, { outcome: "answered" | "expired" }>): NonNullable<AutomationStudioNodeAttemptTrace["ask"]> {
  return {
    askId: ask.askId,
    kind: ask.kind,
    parks: ask.parks,
    status: settlement.outcome === "answered" ? "answered" : "expired",
    route: settlement.route,
    settledAtMs: settlement.settledAtMs
  };
}
