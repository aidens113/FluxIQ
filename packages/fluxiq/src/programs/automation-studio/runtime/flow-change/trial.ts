// Trials one Flow change, whichever entry point produced it: the candidate runs
// on its throwaway copy, with the run's own IO and host, from the node the
// change starts at, and what the run proved is decided by the flow-change
// verdict (`verdict.ts`) over the attempts it made. This module only observes
// and projects; it owns no rule about what counts as proof.
//
// - The run is bounded by the step budget in the options it is given, which
//   for a repair is what the run has left: the trial is also the run's
//   continuation, so no smaller cap applies.
// - A declared expected state counts only when the host was asked about that
//   attempt, answered, and judged every condition it was asked about. The host
//   runtime is wrapped to observe its answers, and every other member of it is
//   left as it was.
// - The executed trace, with real values, is returned for continuing the run
//   and is never to be stored. The saved trace is the one to keep.
// - Where the change came from, and what the failure it answers observed and
//   expected, are returned as ids, codes and counts only, never values.
import type { JsonObject } from "../../../../core/index.ts";
import { parseAutomationStudioFlowChangeOrigin, type AutomationStudioFlowChangeOrigin, type AutomationStudioFlowDocument, type AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExpectationEvaluationContext, AutomationNodeExpectationEvaluator } from "../../nodes/index.ts";
import {
  runAutomationStudioGraph,
  type AutomationStudioGraphExecutionOptions,
  type AutomationStudioGraphExecutionTrace,
  type AutomationStudioNodeAttemptTrace,
  type AutomationStudioTransitionComparison
} from "../executor/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../host-runtime.ts";
import { automationStudioAttemptCapturedRecords, automationStudioAttemptVerifiesState } from "./attempt-projection.ts";
import type { AutomationStudioChangeTrialInput, AutomationStudioChangeTrialResult, AutomationStudioChangeVerdictAttempt } from "./contracts.ts";
import { decideAutomationStudioChangeVerdict } from "./verdict.ts";

export type AutomationStudioFlowChangeTrialRequest = AutomationStudioChangeTrialInput & {
  /** Where the change came from. The result repeats it only when it parses as exactly one entry point. */
  origin?: AutomationStudioFlowChangeOrigin;
  /**
   * For a repair: the attempt that failed, as the run executed it. Its route is
   * never evidence for the change, and it is summarized as the change's
   * observed and expected state.
   */
  failedAttempt?: AutomationStudioNodeAttemptTrace;
  /**
   * What the run expected of the failed node, when it compared the attempt.
   * Defaults to the failed attempt's own comparison. Its declared route and
   * outputs stand for that node's where its trial attempt declares none, and
   * its outputs, when a different changed node produced them, are evidence for
   * that node's change (see `declaredOutputIds`).
   */
  expectedComparison?: AutomationStudioTransitionComparison;
  /**
   * Whether a node is a verification step, so that its success after the change
   * is evidence. Asked beside the node definition's own `metadata.verifiesState`,
   * for nodes whose definition Core cannot see into, such as a policy action
   * dispatching a domain's assertion.
   */
  verifiesState?: (node: AutomationStudioFlowNode) => boolean;
};

export type AutomationStudioFlowChangeTrialReport = AutomationStudioChangeTrialResult & {
  origin?: AutomationStudioFlowChangeOrigin;
  /** What the failed attempt observed: its status, route and failure codes, and counts. */
  observedState?: JsonObject;
  /** What the failed node was expected to do: its declared status and route, and counts. */
  expectedState?: JsonObject;
};

/** What the host answered for one attempt's expected state. */
type HostEvaluation = "passed" | "failed" | "unknown";

const FAILED_ROUTE = "failed";

export async function trialAutomationStudioFlowChange(request: AutomationStudioFlowChangeTrialRequest): Promise<AutomationStudioFlowChangeTrialReport> {
  const evaluations = new Map<string, HostEvaluation>();
  const options: AutomationStudioGraphExecutionOptions = { ...request.options, inputs: request.seedValues };
  if (request.startNodeId) options.startNodeId = request.startNodeId;
  else delete options.startNodeId;
  const hostRuntime = observedHostRuntime(request.options.hostRuntime, evaluations);
  if (hostRuntime) options.hostRuntime = hostRuntime;
  let executedTrace: AutomationStudioGraphExecutionTrace | undefined;
  const savedTrace = await runAutomationStudioGraph(request.candidate, options, (executed) => { executedTrace = executed; });
  if (!executedTrace) throw new Error("The trial run did not hand back the trace it executed.");

  const comparison = request.expectedComparison ?? request.failedAttempt?.transitionComparison;
  const changed = new Set(request.changedNodeIds);
  // A failed attempt that names no route took `failed`, the executor's default.
  const failureRoute = request.failedAttempt ? request.failedAttempt.route ?? FAILED_ROUTE : comparison?.actual.route;
  const verdict = decideAutomationStudioChangeVerdict({
    changedNodeIds: request.changedNodeIds,
    attempts: executedTrace.attempts.map((attempt) => verdictAttempt(attempt, request.candidate, request, comparison, changed, evaluations)),
    runStatus: executedTrace.status,
    ...(executedTrace.currentNodeId !== undefined ? { endNodeId: executedTrace.currentNodeId } : {}),
    ...(failureRoute !== undefined ? { failureRoute } : {}),
    // The Subflow the run's own options name, so the resume point says which
    // graph its node id belongs to.
    ...(request.options.currentSubflowId !== undefined ? { subflowId: request.options.currentSubflowId } : {})
  });
  const origin = request.origin === undefined ? undefined : parseAutomationStudioFlowChangeOrigin(request.origin);
  const failureState = request.failedAttempt ? automationStudioFlowChangeFailureState(request.failedAttempt, comparison) : undefined;
  return {
    verdict,
    savedTrace,
    executedTrace,
    ...(origin ? { origin } : {}),
    ...(failureState?.observedState ? { observedState: failureState.observedState } : {}),
    ...(failureState?.expectedState ? { expectedState: failureState.expectedState } : {})
  };
}

/**
 * The failure a change answers, as counts and codes: what the failed attempt
 * observed, and, where the run compared it, what its node was expected to do.
 * No output, effect payload, message or condition is copied, since any of them
 * can hold page text or a value the run withheld.
 */
export function automationStudioFlowChangeFailureState(
  failedAttempt: AutomationStudioNodeAttemptTrace,
  comparison: AutomationStudioTransitionComparison | undefined = failedAttempt.transitionComparison
): { observedState: JsonObject; expectedState?: JsonObject } {
  const observedState: JsonObject = {
    status: failedAttempt.status,
    ...codeEntry("route", failedAttempt.route),
    ...codeEntry("failureCategory", failedAttempt.failure?.category),
    ...codeEntry("failureCode", failedAttempt.failure?.code),
    outputCount: Object.keys(failedAttempt.outputs).length,
    effectCount: failedAttempt.effects.length
  };
  if (!comparison) return { observedState };
  const { diffSummary, expected } = comparison;
  return {
    observedState: {
      ...observedState,
      comparisonStatus: comparison.status,
      missingOutputCount: diffSummary.missingOutputIds.length,
      unexpectedOutputCount: diffSummary.unexpectedOutputIds.length,
      missingEffectCount: diffSummary.missingEffectTypes.length,
      unexpectedEffectCount: diffSummary.unexpectedEffectTypes.length,
      routeMatched: diffSummary.routeMatched,
      statusMatched: diffSummary.statusMatched
    },
    expectedState: {
      ...codeEntry("status", expected.expectedStatus),
      ...codeEntry("route", expected.expectedRoute),
      outputCount: Object.keys(expected.expectedOutputs ?? {}).length,
      effectCount: expected.expectedEffects?.length ?? 0,
      stateCheckCount: diffSummary.stateCheckCount
    }
  };
}

/** A code is an identifier. Anything else, which a node or host could have filled with text, is left out. */
function codeEntry(key: string, value: string | undefined): JsonObject {
  return typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,126}[A-Za-z0-9])?$/u.test(value) ? { [key]: value } : {};
}

// One executed attempt, as the verdict reads it. Every field is something the
// trial observed or a node declared; an absent field means nothing of that kind.
function verdictAttempt(
  attempt: AutomationStudioNodeAttemptTrace,
  candidate: AutomationStudioFlowDocument,
  request: AutomationStudioFlowChangeTrialRequest,
  comparison: AutomationStudioTransitionComparison | undefined,
  changed: ReadonlySet<string>,
  evaluations: ReadonlyMap<string, HostEvaluation>
): AutomationStudioChangeVerdictAttempt {
  const node = candidate.nodes.find((candidateNode) => candidateNode.id === attempt.nodeId);
  const own = attempt.transitionComparison?.expected;
  const failed = comparison?.expected.nodeId === attempt.nodeId ? comparison.expected : undefined;
  // The executor fills a failed attempt's expected route with `failed` when its
  // node declares none, so a route is read as declared only on a success, and
  // the failed comparison's `failed` is that default, not a declaration,
  // whatever route the failure itself took.
  const failedDeclaredRoute = failed?.expectedRoute === FAILED_ROUTE && comparison?.actual.status === "failed" ? undefined : failed?.expectedRoute;
  const expectedRoute = attempt.status === "succeeded" ? own?.expectedRoute ?? failedDeclaredRoute : undefined;
  const outputIds = Object.keys(attempt.outputs).filter((outputId) => attempt.outputs[outputId] !== undefined);
  const expectedOutputIds = declaredOutputIds(own, failed, changed.has(attempt.nodeId) ? comparison?.expected : undefined, outputIds);
  const declaresState = Object.keys(own?.expectedState ?? {}).length > 0;
  const records = automationStudioAttemptCapturedRecords(attempt);
  const verifiesState = automationStudioAttemptVerifiesState(attempt) || (node !== undefined && request.verifiesState?.(node) === true);
  return {
    nodeId: attempt.nodeId,
    status: attempt.status,
    ...(attempt.route !== undefined ? { route: attempt.route } : {}),
    outputIds,
    ...(expectedRoute !== undefined ? { expectedRoute } : {}),
    ...(expectedOutputIds.length ? { expectedOutputIds } : {}),
    ...(declaresState ? { expectedState: evaluations.get(attempt.attemptId) ?? "unknown" } : {}),
    ...(records ? { records } : {}),
    ...(verifiesState ? { verifiesState } : {})
  };
}

/**
 * The outputs an attempt is held to: its node's own, else the failed node's
 * when this is that node. A different changed node answers the same failure,
 * and output ids name entries in the run's shared values whoever writes them,
 * so the failed node's outputs count for it too, but only as evidence it
 * produced: another node's declaration never contradicts a change. A route is
 * a port of one definition and is never carried across.
 */
function declaredOutputIds(
  own: AutomationStudioTransitionComparison["expected"] | undefined,
  failed: AutomationStudioTransitionComparison["expected"] | undefined,
  answered: AutomationStudioTransitionComparison["expected"] | undefined,
  outputIds: readonly string[]
): string[] {
  const ownOutputIds = Object.keys(own?.expectedOutputs ?? {});
  if (ownOutputIds.length) return ownOutputIds;
  if (failed) return Object.keys(failed.expectedOutputs ?? {});
  const answeredOutputIds = Object.keys(answered?.expectedOutputs ?? {});
  return answeredOutputIds.every((outputId) => outputIds.includes(outputId)) ? answeredOutputIds : [];
}


/**
 * The host runtime with its expectation evaluator observed, keyed by the
 * attempt the host was asked about. An attempt asked twice, which only a Call
 * Flow child reusing an id can cause, is `unknown`. A throw is `unknown` and is
 * passed on unchanged. Every other member is read from the host itself, with
 * methods bound to it, so a host that keeps private state still works.
 *
 * A host's `passed` counts only once it has judged every condition it was
 * asked about, which is what `checkedConditionCount` reports. `passed: true` on
 * a short count is the host's documented answer for "nothing I could look at
 * said otherwise", not "the evidence held": a condition that names something
 * the page cannot be asked — the common case when a model authors them — comes
 * back unjudged and counted out. Reading `passed` alone turned that into
 * `expected_state: passed`, and a change nobody had evidence for into a
 * verified, resumable one. A short count is `unknown` here, which is never a
 * pass, so the change stays unproved and the run stays put.
 */
function observedHostRuntime(
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined,
  evaluations: Map<string, HostEvaluation>
): AutomationStudioHostRuntimeBoundary | undefined {
  const evaluate = hostRuntime?.expectationEvaluator;
  if (!hostRuntime || !evaluate) return hostRuntime;
  const host: AutomationStudioHostRuntimeBoundary = hostRuntime;
  const askedBy = new Map<string, string>();
  const record = (context: AutomationNodeExpectationEvaluationContext, outcome: HostEvaluation) => {
    if (!context.attemptId) return;
    const previous = askedBy.get(context.attemptId);
    askedBy.set(context.attemptId, context.source);
    // The transition comparison re-checks a rejection before it builds the
    // failure record, so a second answer from the same source is that re-check,
    // is the one the run acted on, and replaces the first. Two answers from
    // *different* sources are two different questions about one attempt, and
    // nothing here can reconcile them, so that stays unknown.
    evaluations.set(context.attemptId, previous !== undefined && previous !== context.source ? "unknown" : outcome);
  };
  const observed: AutomationNodeExpectationEvaluator = async (conditions, mode, timeoutMs, context) => {
    let evaluation: Awaited<ReturnType<AutomationNodeExpectationEvaluator>>;
    try {
      evaluation = await evaluate.call(host, conditions, mode, timeoutMs, context);
    } catch (error) {
      record(context, "unknown");
      throw error;
    }
    // Asked about nothing is judged nothing, so a `passed` over an empty list
    // is unknown too rather than vacuously true.
    const judged = conditions.length > 0 && (evaluation?.checkedConditionCount ?? 0) >= conditions.length;
    record(context, evaluation?.passed === true && judged ? "passed" : evaluation?.passed === false ? "failed" : "unknown");
    return evaluation;
  };
  // The proxy's own target is an empty object, so a frozen host cannot trip the
  // invariants a proxy keeps for its target's fixed properties.
  return new Proxy(Object.create(null) as AutomationStudioHostRuntimeBoundary, {
    get(_empty, property) {
      if (property === "expectationEvaluator") return observed;
      const value: unknown = Reflect.get(host, property, host);
      return typeof value === "function" ? value.bind(host) : value;
    },
    has(_empty, property) {
      return Reflect.has(host, property);
    }
  });
}
