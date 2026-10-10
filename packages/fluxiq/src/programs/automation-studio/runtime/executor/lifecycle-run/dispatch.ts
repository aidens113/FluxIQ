// The lifecycle dispatcher at run time (state-aware recovery plan, C3-C5, C7).
//
// This module owns dispatching one lifecycle event at one node of the frame
// executing now: resolving the candidates in scope, observing their `when`
// in one batch, running the first whose `when` is `true` in a handler frame,
// re-observing what its continuation needs, and deciding its disposition. It
// builds on the pure contracts in `../lifecycle/` and never decides what they
// decide. A Flow with no Handler nodes in scope gets `none` with no fact call,
// and an authored path (a `failed` edge, a way on, a clears-interference node)
// is handed back to graph-run's existing ladder code.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioInvocationFrame, AutomationStudioFramePhase, AutomationStudioRunFrames } from "../frames/index.ts";
import {
  automationStudioLifecycleBudget,
  chargeAutomationStudioLifecycleBudget,
  type AutomationStudioLifecycleContinuation,
  decideAutomationStudioDisposition,
  type AutomationStudioDispositionDecision,
  type AutomationStudioRouteCheck,
  type AutomationStudioFactCondition,
  type AutomationStudioFactConditionResult,
  type AutomationStudioFactTruth,
  automationStudioFactConditionsHold,
  parseAutomationStudioFactConditions,
  automationStudioHandlerOccurrenceKey,
  resolveAutomationStudioHandlerCandidates,
  type AutomationStudioHandlerCandidate
} from "../lifecycle/index.ts";
import { automationStudioNodeReadinessState } from "../recorded-state.ts";
import type { AutomationStudioLifecycleDispatchInput, AutomationStudioLifecycleDispatchOutcome, AutomationStudioLifecycleHandlerRun } from "./dispatch-contracts.ts";
import { automationStudioLifecycleRunRecords } from "./dispatch-records.ts";
import { observeAutomationStudioFacts, type AutomationStudioFactObservationGroup } from "./fact-observation.ts";
import { runAutomationStudioHandlerBody, type AutomationStudioHandlerBodyRun } from "./handler-body.ts";
import { automationStudioIncidentArrivalKey } from "./incident-open.ts";
import { automationStudioActiveLifecycleRegistrations, automationStudioRegisterLifecycleGraph } from "./registry.ts";
import { automationStudioLifecycleRouteTarget } from "./route-target.ts";
import type { AutomationStudioRegisteredLifecycleGraph } from "./run-state.ts";

/** The frame phase each event fires at (`../frames/invocation-frame.ts`). */
const EVENT_PHASE: Readonly<Record<AutomationStudioLifecycleEvent, AutomationStudioFramePhase>> = Object.freeze({
  start: "before_attempt",
  before: "before_attempt",
  retry: "before_retry",
  fail: "failed",
  before_next: "before_next"
});

/** Everything one dispatch shares while it walks its candidates. */
type Dispatch = {
  input: AutomationStudioLifecycleDispatchInput;
  run: AutomationStudioRunFrames;
  current: AutomationStudioInvocationFrame;
  framePath: string[];
  graphs: ReadonlyMap<string, AutomationStudioRegisteredLifecycleGraph>;
  candidates: AutomationStudioHandlerCandidate[];
  observations: number;
  now: () => number;
};

/**
 * Dispatches `input.event` at `input.nodeId` in the frame executing now (the
 * last frame of `input.options.invocation.run.stack`):
 *
 * 1. Resolves the candidates in scope (`resolveAutomationStudioHandlerCandidates`)
 *    from the registrations of the active frames' graphs and the recovery
 *    Subflow graph. With no Handler-node candidate: `none`, no fact call.
 * 2. Walks the candidates in order. An authored path reached first is returned
 *    as `authored`. Otherwise every Handler-node candidate before it is
 *    observed in one batch, and the first whose `when` is `true` is charged to
 *    the budget under its occurrence key and run in a handler frame.
 * 3. After its body, re-observes once what the continuation needs -- its
 *    completion check, the node's ready state when written as fact
 *    conditions, a route target's `when` -- and decides the disposition
 *    (`decideAutomationStudioDisposition`).
 * 4. An `unhandled` decision goes on to the next candidate, re-observing
 *    first; at `before`, so does `resume`, so several On Before handlers can
 *    each clear one thing, one at a time, each at most once per dispatch.
 *    Any other decision ends the dispatch.
 */
export async function dispatchAutomationStudioLifecycleEvent(input: AutomationStudioLifecycleDispatchInput): Promise<AutomationStudioLifecycleDispatchOutcome> {
  const run = input.options.invocation?.run;
  const current = run?.stack[run.stack.length - 1];
  if (!run || !current) return { kind: "none", observations: 0, runs: [] };
  automationStudioRegisterLifecycleGraph(run.lifecycle, input.graph);
  if (run.stack.some((frame) => frame.cursor.phase === "handler")) return { kind: "none", observations: 0, runs: [] };
  const { registrations, graphs } = await automationStudioActiveLifecycleRegistrations(run, input.options.subflowGraphs);
  const candidates = resolveAutomationStudioHandlerCandidates({ stack: run.stack, registrations, event: input.event, nodeId: input.nodeId });
  if (!candidates.some(isHandlerNode)) return { kind: "none", observations: 0, runs: [] };
  run.lifecycle.budget ??= automationStudioLifecycleBudget(input.options.recoveryBudget);
  const dispatch: Dispatch = { input, run, current, framePath: run.stack.map((frame) => frame.invocationId), graphs, candidates, observations: 0, now: input.options.now ?? Date.now };
  return await walk(dispatch);
}

async function walk(dispatch: Dispatch): Promise<AutomationStudioLifecycleDispatchOutcome> {
  const { input, candidates } = dispatch;
  const runs: AutomationStudioLifecycleHandlerRun[] = [];
  const tried = new Set<string>();
  let fresh: ReadonlyMap<string, readonly AutomationStudioFactConditionResult[]> | undefined;
  for (;;) {
    const next = candidates.find((candidate) => !tried.has(candidate.registration.handlerId));
    if (!next) break;
    const { source } = next.registration;
    if (source.kind !== "handler_node") {
      return { kind: "authored", source, registration: next.registration, level: next.level, observations: dispatch.observations, runs };
    }
    const asked = handlersBeforeAuthored(candidates, tried);
    if (!fresh || asked.some((candidate) => !fresh!.has(candidate.registration.handlerId))) fresh = await observe(dispatch, asked.map((candidate) => ({ key: candidate.registration.handlerId, conditions: candidate.registration.when })));
    const results = fresh;
    const chosen = asked.find((candidate) => automationStudioFactConditionsHold(candidate.registration.when, results.get(candidate.registration.handlerId) ?? []) === "true");
    if (!chosen) {
      for (const candidate of asked) tried.add(candidate.registration.handlerId);
      continue;
    }
    tried.add(chosen.registration.handlerId);
    const handled = await runCandidate(dispatch, chosen, results.get(chosen.registration.handlerId) ?? [], selection(candidates, chosen, results));
    runs.push(handled);
    if (handled.execution.outcome !== "refused") fresh = undefined;
    const { decision } = handled;
    if (decision.kind === "unhandled" || (decision.kind === "resume" && input.event === "before")) continue;
    return { kind: "handled", decision, ...(handled.routeTarget ? { routeTarget: handled.routeTarget } : {}), observations: dispatch.observations, runs };
  }
  if (!runs.length) return { kind: "none", observations: dispatch.observations, runs };
  const resumed = input.event === "before" && runs.some((handled) => handled.decision.kind === "resume");
  return { kind: "handled", decision: resumed ? { kind: "resume" } : runs[runs.length - 1]!.decision, observations: dispatch.observations, runs };
}

/** The Handler-node candidates not yet tried that come before the first authored candidate not yet tried. */
function handlersBeforeAuthored(candidates: readonly AutomationStudioHandlerCandidate[], tried: ReadonlySet<string>): AutomationStudioHandlerCandidate[] {
  const asked: AutomationStudioHandlerCandidate[] = [];
  for (const candidate of candidates) {
    if (tried.has(candidate.registration.handlerId)) continue;
    if (!isHandlerNode(candidate)) break;
    asked.push(candidate);
  }
  return asked;
}

/** Charges, runs and decides one handler whose `when` is `true`, or refuses it with its reason. */
async function runCandidate(dispatch: Dispatch, candidate: AutomationStudioHandlerCandidate, when: readonly AutomationStudioFactConditionResult[], why: string): Promise<AutomationStudioLifecycleHandlerRun> {
  const { input, run, current } = dispatch;
  const registration = candidate.registration;
  const state = run.lifecycle;
  const startedAt = dispatch.now();
  const occurrence = automationStudioHandlerOccurrenceKey({
    handlerId: registration.handlerId,
    nodeArrival: { invocationId: current.invocationId, nodeId: input.nodeId, arrival: input.arrival },
    conditionEvidence: when.map((result) => (result.evidenceRef === undefined ? { truth: result.truth } : { truth: result.truth, evidenceRef: result.evidenceRef })) as JsonValue
  });
  const graph = dispatch.graphs.get(registration.graphFlowId);
  const bodyNodeId = registration.source.kind === "handler_node" ? registration.source.bodyNodeId : undefined;
  const incident = input.incidentId ? state.incidents.get(input.incidentId) : undefined;
  // A refusal of a handler that already ran is kept on the trace but says nothing in the chat: it is not news (`quiet`).
  const refuse = (reason: string, quiet = false): AutomationStudioLifecycleHandlerRun => finish(dispatch, { candidate, why, occurrence, when, startedAt, decision: { kind: "unhandled", reason }, ran: false, completionCheck: "unknown", quiet });
  if (!graph || !bodyNodeId) return refuse("The handler has no body to run.");
  if (input.event === "fail" && incident?.handlersRun.some((key) => key.startsWith(`${registration.handlerId}@`))) {
    return refuse("This handler was already tried for this incident.", true);
  }
  const ledgerKey = input.incidentId ?? `arrival:${automationStudioIncidentArrivalKey({ invocationId: current.invocationId, nodeId: input.nodeId, arrival: input.arrival })}`;
  const alreadyRan = (state.ledger.incidents[ledgerKey]?.occurrences[occurrence] ?? 0) >= Math.max(1, registration.maxRuns);
  const charged = chargeAutomationStudioLifecycleBudget(state.ledger, state.budget!, { kind: "handler_run", incidentId: ledgerKey, occurrenceKey: occurrence, maxRuns: registration.maxRuns });
  if (!charged.allowed) return refuse(charged.reason, alreadyRan);
  state.ledger = charged.ledger;
  incident?.handlersRun.push(occurrence);
  const body = await runAutomationStudioHandlerBody({
    run,
    parent: current,
    graph,
    bodyNodeId,
    options: input.options,
    inputs: { ...input.values },
    ...(input.incidentId ? { incidentId: input.incidentId } : {}),
    ...(input.remainingSteps !== undefined ? { maxSteps: input.remainingSteps } : {}),
    ...(input.priorAttemptCount !== undefined ? { priorAttemptCount: input.priorAttemptCount } : {})
  });
  const settled = await settle(dispatch, candidate, body);
  return finish(dispatch, { candidate, why, occurrence, when, startedAt, ran: true, body, ...settled });
}

/** Re-observes what the continuation needs, once, and decides the disposition. */
async function settle(dispatch: Dispatch, candidate: AutomationStudioHandlerCandidate, body: AutomationStudioHandlerBodyRun): Promise<{
  decision: AutomationStudioDispositionDecision;
  completionCheck: AutomationStudioFactTruth;
  readyState?: AutomationStudioFactTruth;
  routeTarget?: ReturnType<typeof automationStudioLifecycleRouteTarget>;
}> {
  const { input, run, current } = dispatch;
  const registration = candidate.registration;
  const coreStop = body.coreStop ?? input.coreStop;
  const continuation: AutomationStudioLifecycleContinuation = {
    framePath: dispatch.framePath,
    nodeId: input.nodeId,
    phase: EVENT_PHASE[input.event],
    event: input.event,
    attemptNumber: input.attemptNumber,
    inputs: current.inputs,
    outputsSoFar: input.outputsSoFar ?? {},
    lastingActStatus: input.lastingActStatus ?? "none",
    ...(input.incidentId ? { incidentId: input.incidentId } : {})
  };
  const decideWith = (completionCheck: AutomationStudioFactTruth, route?: AutomationStudioRouteCheck): AutomationStudioDispositionDecision => decideAutomationStudioDisposition({
    continuation,
    written: body.written,
    completionCheck,
    bodyFailed: body.bodyFailed,
    ...(coreStop ? { coreStop } : {}),
    ...(route ? { route } : {}),
    ...(input.requiredOutputIds ? { requiredOutputIds: input.requiredOutputIds } : {})
  });
  if (body.bodyFailed || coreStop) {
    const decision = decideWith("unknown");
    return { decision: decision.kind === "unhandled" && body.reason ? { kind: "unhandled", reason: body.reason } : decision, completionCheck: "unknown" };
  }
  const readyConditions = factReadyState(dispatch);
  const routeTarget = body.written.kind === "route"
    ? automationStudioLifecycleRouteTarget({ stack: run.stack, graphs: dispatch.graphs, checkpointId: body.written.checkpointId, values: input.values, valuesOf: (invocationId) => run.lifecycle.frames.get(invocationId)?.values })
    : undefined;
  const groups: AutomationStudioFactObservationGroup[] = [
    { key: "completion", conditions: registration.completionCheck },
    { key: "ready", conditions: readyConditions ?? [] },
    { key: "route", conditions: routeTarget?.checkpoint.when ?? [] }
  ];
  const observed = await observe(dispatch, groups);
  const completionCheck = automationStudioFactConditionsHold(registration.completionCheck, observed.get("completion") ?? []);
  const readyState = readyConditions ? automationStudioFactConditionsHold(readyConditions, observed.get("ready") ?? []) : undefined;
  const guard = routeTarget && input.routeGuard ? input.routeGuard(routeTarget.target) : undefined;
  // A target the step loop cannot reach is not found, so the route is refused before the route budget is charged.
  const route: AutomationStudioRouteCheck | undefined = body.written.kind !== "route" ? undefined : {
    found: Boolean(routeTarget) && !guard?.unreachable,
    when: routeTarget ? automationStudioFactConditionsHold(routeTarget.checkpoint.when, observed.get("route") ?? []) : "unknown",
    requiresBound: routeTarget?.requiresBound ?? false,
    passesUncertainAct: guard?.passesUncertainAct ?? false,
    repeatsCompletedReconcile: guard?.repeatsCompletedReconcile ?? false,
    ...(guard?.effectCheck ? { effectCheck: guard.effectCheck } : {})
  };
  let decision = decideWith(completionCheck, route);
  if (decision.kind === "route") decision = routeAllowed(dispatch, decision.checkpointId, Boolean(guard));
  return { decision, completionCheck, ...(readyState ? { readyState } : {}), ...(decision.kind === "route" && routeTarget ? { routeTarget } : {}) };
}

/** A route the rules allowed, if graph-run vouched for what it would pass and the run has a route left to spend. */
function routeAllowed(dispatch: Dispatch, checkpointId: string, guarded: boolean): AutomationStudioDispositionDecision {
  if (!guarded) return { kind: "unhandled", reason: `The route to "${checkpointId}" was not taken: this run could not check what the route would pass or repeat.` };
  const state = dispatch.run.lifecycle;
  const charged = chargeAutomationStudioLifecycleBudget(state.ledger, state.budget!, { kind: "route", incidentId: dispatch.input.incidentId ?? "" });
  if (!charged.allowed) return { kind: "unhandled", reason: charged.reason };
  state.ledger = charged.ledger;
  return { kind: "route", checkpointId };
}

/** The node's ready state as fact conditions, when it is written as them; an expectation-form ready state is the readiness gate's. */
function factReadyState(dispatch: Dispatch): AutomationStudioFactCondition[] | undefined {
  const node = dispatch.input.graph.graph.nodes.find((candidate) => candidate.id === dispatch.input.nodeId);
  const readyState = node ? automationStudioNodeReadinessState(node) : undefined;
  if (!readyState) return undefined;
  const parsed = parseAutomationStudioFactConditions(Array.isArray(readyState.conditions) ? readyState.conditions : [readyState], "readyState");
  return parsed.problems.length || !parsed.conditions.length ? undefined : parsed.conditions;
}

/** One batched observation, counted on the dispatch. */
async function observe(dispatch: Dispatch, groups: readonly AutomationStudioFactObservationGroup[]): Promise<ReadonlyMap<string, readonly AutomationStudioFactConditionResult[]>> {
  const { input, current } = dispatch;
  const observation = await observeAutomationStudioFacts({
    hostRuntime: input.options.hostRuntime,
    groups,
    context: {
      inputs: current.inputs,
      values: input.values,
      nodeId: input.nodeId,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      ...(input.options.signal ? { signal: input.options.signal } : {})
    },
    now: dispatch.now
  });
  dispatch.observations += observation.calls;
  if (observation.problem) dispatch.run.lifecycle.problems.push(observation.problem);
  return observation.results;
}

/** Why `chosen` was the one: its level, and what the candidates before it answered. */
function selection(candidates: readonly AutomationStudioHandlerCandidate[], chosen: AutomationStudioHandlerCandidate, results: ReadonlyMap<string, readonly AutomationStudioFactConditionResult[]>): string {
  const at = candidates.indexOf(chosen);
  const before = candidates.slice(0, at).filter(isHandlerNode).map((candidate) => {
    const truth = automationStudioFactConditionsHold(candidate.registration.when, results.get(candidate.registration.handlerId) ?? []);
    return `${candidate.registration.handlerId} (${candidate.level} scope) ${truth === "true" ? "already ran or was refused" : `did not apply: its conditions are ${truth}`}`;
  });
  const after = candidates.slice(at + 1).map((candidate) => `${candidate.registration.handlerId} (${candidate.level} scope)`);
  const order = "node scope is tried before subflow, ancestor and automation scope, then by order and document order";
  return [
    `${chosen.registration.handlerId} ran at ${chosen.level} scope because its conditions are all true and ${order}.`,
    before.length ? `Before it: ${before.join("; ")}.` : "",
    after.length ? `Not reached: ${after.join(", ")}.` : ""
  ].filter(Boolean).join(" ");
}

/** The run's records, emitted and returned. */
function finish(dispatch: Dispatch, outcome: {
  candidate: AutomationStudioHandlerCandidate;
  why: string;
  occurrence: string;
  when: readonly AutomationStudioFactConditionResult[];
  startedAt: number;
  decision: AutomationStudioDispositionDecision;
  completionCheck: AutomationStudioFactTruth;
  ran: boolean;
  quiet?: boolean;
  body?: AutomationStudioHandlerBodyRun;
  readyState?: AutomationStudioFactTruth;
  routeTarget?: ReturnType<typeof automationStudioLifecycleRouteTarget>;
}): AutomationStudioLifecycleHandlerRun {
  const { input } = dispatch;
  const { registration, level } = outcome.candidate;
  const handlerNode = registration.source.kind === "handler_node" ? dispatch.graphs.get(registration.graphFlowId)?.graph.nodes.find((node) => node.id === registration.source.nodeId) : undefined;
  const target = outcome.decision.kind === "route" ? outcome.routeTarget?.target : undefined;
  const records = automationStudioLifecycleRunRecords({
    executionId: dispatch.run.lifecycle.nextId("handler-execution"),
    event: input.event,
    handlerId: registration.handlerId,
    framePath: dispatch.framePath,
    nodeId: input.nodeId,
    ...(input.incidentId ? { incidentId: input.incidentId } : {}),
    occurrence: outcome.occurrence,
    when: outcome.when,
    completionCheck: outcome.completionCheck,
    decision: outcome.decision,
    ran: outcome.ran,
    bodyFailed: outcome.body?.bodyFailed ?? false,
    startedAt: outcome.startedAt,
    finishedAt: dispatch.now(),
    ...(handlerNode?.label ? { label: handlerNode.label } : {}),
    ...(target ? { targetId: target.checkpointId } : {}),
    ...(outcome.quiet ? { quiet: true } : {})
  });
  dispatch.run.lifecycle.executions.push(records.execution);
  // The last handler that ran for the incident, which an in-run repair names as its unit when it failed (C6 step 8).
  if (outcome.ran && input.incidentId && registration.source.kind === "handler_node") {
    const failed = (outcome.body?.bodyFailed ?? false) || outcome.completionCheck !== "true";
    dispatch.run.lifecycle.handlerRuns.set(input.incidentId, { handlerId: registration.handlerId, graphFlowId: registration.graphFlowId, handlerNodeId: registration.source.nodeId, failed });
  }
  return {
    handlerId: registration.handlerId,
    level,
    selection: outcome.ran ? outcome.why : `${outcome.why} It was not run: ${outcome.decision.kind === "unhandled" ? outcome.decision.reason : "refused"}`,
    occurrence: outcome.occurrence,
    decision: outcome.decision,
    ...(records.lifecycle ? { lifecycle: { ...records.lifecycle, selection: outcome.why } } : {}),
    execution: records.execution,
    recovery: records.recovery,
    ...(outcome.body?.trace ? { bodyTrace: outcome.body.trace } : {}),
    bodySteps: outcome.body?.steps ?? 0,
    ...(outcome.readyState ? { readyState: outcome.readyState } : {}),
    ...(target ? { routeTarget: target } : {})
  };
}

function isHandlerNode(candidate: AutomationStudioHandlerCandidate): boolean {
  return candidate.registration.source.kind === "handler_node";
}
