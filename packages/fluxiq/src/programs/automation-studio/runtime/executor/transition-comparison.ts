import { parseAutomationStudioFailureRecord, type AutomationStudioAdaptiveFailureClass, type AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../nodes/index.ts";
import { EXPECTATION_REJECTED_FAILURE } from "../../nodes/policy/index.ts";
import { hostExpectationEvaluator, type AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import { AUTOMATION_STUDIO_EXPECTED_FACTS_FALSE_FAILURE, AUTOMATION_STUDIO_EXPECTED_STATE_FACTS_KEY, automationStudioNodeActLasts, type AutomationStudioEffectCheckResult, type AutomationStudioLastingActCheck } from "./defensive/index.ts";
import { automationStudioFactConditionsHold, parseAutomationStudioFactConditions, type AutomationStudioFactCondition, type AutomationStudioFactTruth } from "./lifecycle/index.ts";
import { observeAutomationStudioFacts } from "./lifecycle-run/index.ts";
import { automationStudioRunWait } from "./pacing/index.ts";
import { actualTransitionForAttempt } from "./actual-transition.ts";
import { automationStudioExpectationRequest, automationStudioReadinessCeilingMs, automationStudioRecordedState } from "./recorded-state.ts";
import type { AutomationStudioActualTransition, AutomationStudioExpectedTransition, AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace, AutomationStudioTransitionComparison, AutomationStudioTransitionComparisonStatus } from "./contracts.ts";
import { expectedTransitionForNode } from "./expected-transition.ts";

// How a structured failure category reads as a transition comparison for a
// failed attempt. Typed as exhaustive, so a new category cannot ship without
// a comparison status.
const COMPARISON_STATUS_FOR_FAILURE: Readonly<Record<AutomationStudioAdaptiveFailureClass, AutomationStudioTransitionComparisonStatus>> = {
  action_failed: "action_failed",
  expected_state_missing: "missing_expected_state",
  unexpected_state: "unexpected_state",
  timeout: "timeout",
  blocked_by_capability_or_policy: "blocked",
  missing_router_or_subflow_target: "action_failed",
  graph_validation_or_unknown_node: "action_failed",
  external_side_effect_denied: "blocked",
  ambiguous_or_unknown: "action_failed",
  target_not_found: "target_not_found",
  target_ambiguous: "target_ambiguous",
  navigation_unexpected: "unexpected_state",
  output_not_observed: "missing_expected_state",
  page_changed: "unexpected_state",
  auth_required: "blocked",
  user_intervention_required: "blocked"
};

/**
 * Compares one attempt against what the node was expected to do. `evaluation`
 * is the host's verdict on `expectedState`; with none, expected state is read
 * from the attempt's own route as it always was.
 */
export function compareAutomationStudioTransition(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace, evaluation?: AutomationNodeExpectationEvaluation): AutomationStudioTransitionComparison {
  const expected = expectedTransitionForNode(node, attempt);
  const actual = actualTransitionForAttempt(attempt);
  const expectedOutputIds = Object.keys(expected.expectedOutputs ?? {});
  const actualOutputIds = Object.keys(actual.outputs);
  const expectedEffectTypes = (expected.expectedEffects ?? []).map((effect) => effect.type);
  const actualEffectTypes = actual.effects.map((effect) => effect.type);
  const missingOutputIds = expectedOutputIds.filter((id) => actual.outputs[id] === undefined);
  const unexpectedOutputIds = actualOutputIds.filter((id) => !expectedOutputIds.includes(id));
  const missingEffectTypes = uniqueStrings(expectedEffectTypes.filter((type) => !actualEffectTypes.includes(type)));
  const unexpectedEffectTypes = uniqueStrings(actualEffectTypes.filter((type) => !expectedEffectTypes.includes(type)));
  const routeMatched = expected.expectedRoute === undefined
    || actual.route === expected.expectedRoute
    || Boolean(expected.tolerance?.toleratedRoutes?.includes(actual.route ?? ""));
  const statusMatched = expected.expectedStatus === undefined || actual.status === expected.expectedStatus || (expected.tolerance?.allowWaiting === true && actual.status === "waiting");
  // A host that evaluated the expectation reports what it checked; only
  // without one does Core fall back to counting expected-state keys.
  const stateCheckCount = evaluation?.checkedConditionCount ?? Object.keys(expected.expectedState ?? {}).length;
  const status = classifyTransitionComparisonStatus({
    expected,
    actual,
    failure: attempt.failure,
    missingOutputIds,
    missingEffectTypes,
    routeMatched,
    statusMatched,
    stateCheckCount,
    evaluation
  });
  const message = (status === "missing_expected_state" ? evaluation?.message : undefined)
    ?? comparisonMessage(status, expected, actual, missingOutputIds, missingEffectTypes);
  return {
    comparisonId: `${attempt.attemptId}.comparison`,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    status,
    expected,
    actual,
    diffSummary: {
      missingOutputIds,
      unexpectedOutputIds,
      missingEffectTypes,
      unexpectedEffectTypes,
      routeMatched,
      statusMatched,
      stateCheckCount
    },
    ...(message ? { message } : {}),
    // Set only where the host judged the expected state: a comparison read off
    // the attempt's own route, or kept when the evaluator broke, proves nothing
    // about the page (C9), and a held repair is validated only on this
    // (`service/runtime-adaptation/held-fix-validation.ts`).
    ...(evaluation ? { metadata: { hostEvaluated: true } } : {})
  };
}

/**
 * Asks the bound host to evaluate the attempt's `expectedState` against its
 * current snapshot, then recompares with that verdict.
 *
 * **A failed attempt is evaluated too.** It was not: the whole check was
 * guarded by `attempt.status !== "succeeded"`, so the recorded expectation was
 * consulted only to demote a success and never to understand a failure -- the
 * state checker switched off at exactly the moment it would help. A failure
 * whose expected state turns out to hold anyway is marked
 * `expectationSatisfiedAfterFailure` on its comparison, which is what lets the
 * ladder skip the node instead of repeating an action that already happened.
 *
 * **A rejection is re-checked before the failure record is built.** One
 * evaluation reads the page at a single instant, and a page that is a moment
 * late would otherwise mint a non-retryable state mismatch for a node that
 * would have passed on a second look. The re-check spends the node's wait
 * ceiling, and only then is the record built.
 *
 * **An expected state of page facts is read as facts (t413).** A step's own
 * `done when:` is stored as `{ facts: [...] }` (`./defensive/effect-check.ts`):
 * C9 fact conditions, asked through the batched fact check, read again until
 * they hold or the node's wait ceiling passes. All `true` accepts; a `false`
 * left at the end rejects, as a host's rejection does; `unknown` judges
 * nothing, and the attempt keeps its own outcome.
 *
 * Returns the attempt untouched when no evaluator is bound, the attempt has no
 * expected state or one with no keys, or the evaluator throws, and with only
 * its comparison replaced when the host accepts.
 */
export async function attemptWithHostExpectationEvaluation(
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions
): Promise<AutomationStudioNodeAttemptTrace> {
  const evaluate = hostExpectationEvaluator(options.hostRuntime);
  const expectedState = attempt.transitionComparison?.expected.expectedState;
  // A waiting attempt has not finished, and the expectation node already asked
  // the host itself, so neither is asked twice. An expected state with no keys
  // names nothing to check, so it counts as none.
  const evaluable = attempt.status === "succeeded" || attempt.status === "failed";
  if (!expectedState || Object.keys(expectedState).length === 0 || !evaluable || node.definitionId === "builtin.policy.expectation") return attempt;
  const facts = expectedFacts(expectedState);
  if (facts) return attemptWithExpectedFacts(node, attempt, facts, options);
  if (!evaluate) return attempt;
  const stateRef = currentStateRef(attempt);
  const ask = (timeoutMs?: number): Promise<AutomationNodeExpectationEvaluation> => {
    const request = automationStudioExpectationRequest(expectedState, timeoutMs);
    return Promise.resolve(evaluate(request.conditions, request.mode, request.timeoutMs, {
      source: "transition_comparison",
      nodeId: attempt.nodeId,
      attemptId: attempt.attemptId,
      ...(stateRef ? { stateRef } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    }));
  };
  const ceilingMs = automationStudioReadinessCeilingMs(automationStudioRecordedState(node).recordedGapMs);
  let evaluation: AutomationNodeExpectationEvaluation;
  try {
    const first = await ask();
    // A failed attempt is never demoted further and never promoted here: the
    // ladder owns what to do about a state that holds despite the failure. All
    // this records is what the host saw.
    if (attempt.status === "failed") return { ...attempt, transitionComparison: failedAttemptComparison(node, attempt, first) };
    const second = first.passed ? undefined : await ask(ceilingMs);
    evaluation = second?.passed ? second : first;
  } catch {
    // An evaluator that broke says nothing about the page, so the attempt keeps
    // the outcome its own execution gave it, unjudged.
    return attempt;
  }
  if (evaluation.passed) return { ...attempt, transitionComparison: compareAutomationStudioTransition(node, attempt, evaluation) };
  // The host's record is parsed where it becomes the attempt's, as a node
  // result's is, and one that does not parse gives way to Core's own. The
  // comparison reads the same record, so its status never disagrees with it.
  // Either way it was found after the act answered success, so its stage is
  // `verification`, which is what keeps a lasting act from being made again
  // (`./defensive/assess.ts`, t413).
  const failure: AutomationStudioFailureRecord = { ...(parseAutomationStudioFailureRecord(evaluation.failure) ?? EXPECTATION_REJECTED_FAILURE), stage: "verification" };
  return {
    ...attempt,
    status: "failed",
    route: "failed",
    message: evaluation.message ?? "The host reported that the expected state does not hold.",
    failure,
    transitionComparison: compareAutomationStudioTransition(node, attempt, { ...evaluation, failure })
  };
}

/**
 * A graph run's effect check (C6 step 4, C8): whether a lasting act whose
 * outcome was uncertain took effect, judged by the host's *waiting* expectation
 * evaluation of the node's `expectedState` -- the same evaluator and request
 * the success re-check above uses, given the longer of the node's wait ceiling
 * and the window the expected state declares. A zero-wait `false` on a slow
 * page would read as "did not land" and make the act a second time.
 *
 * `landed` when the attempt's own evaluation already saw the state hold, or
 * when every condition was judged and held (`any`: one held); `not_landed` only
 * when the page answered and a judged condition did not hold (`any`: every
 * condition was judged and none held). `unknown` otherwise: no expected state,
 * no evaluator, a host that judged nothing or did not say how much it judged,
 * an evaluator that threw. A missing acknowledgement is never `not_landed`.
 *
 * An expected state of page facts (t413) is asked through the batched fact
 * check instead, read again until every fact holds or the same window passes:
 * all `true` is `landed`; a `false` left at the end is `not_landed` only for
 * an act that does not last -- for a lasting one it is `unknown`, so the run
 * stops as Outcome uncertain rather than act twice on a page fact -- and
 * anything else `unknown`: a host with no fact check, one that failed, a fact
 * it could not settle.
 */
export function automationStudioHostEffectCheck(node: AutomationStudioFlowNode, options: AutomationStudioGraphExecutionOptions): AutomationStudioLastingActCheck<AutomationStudioNodeAttemptTrace> {
  return async (attempt) => {
    const evaluate = hostExpectationEvaluator(options.hostRuntime);
    const expectedState = attempt.transitionComparison?.expected.expectedState ?? expectedTransitionForNode(node, attempt).expectedState;
    if (!expectedState || Object.keys(expectedState).length === 0) return "unknown";
    if (automationStudioExpectationSatisfiedAfterFailure(attempt.transitionComparison)) return "landed";
    const facts = expectedFacts(expectedState);
    if (facts) {
      const windowMs = Math.max(automationStudioExpectationRequest(expectedState).timeoutMs, automationStudioReadinessCeilingMs(automationStudioRecordedState(node).recordedGapMs));
      const read = await readExpectedFacts(facts, attempt, options, windowMs);
      if (read.truth === "true") return "landed";
      return read.truth === "false" && !automationStudioNodeActLasts(node) ? "not_landed" : "unknown";
    }
    if (!evaluate) return "unknown";
    const declared = automationStudioExpectationRequest(expectedState);
    const windowMs = Math.max(declared.timeoutMs, automationStudioReadinessCeilingMs(automationStudioRecordedState(node).recordedGapMs));
    const request = automationStudioExpectationRequest(expectedState, windowMs);
    const stateRef = currentStateRef(attempt);
    const verdict = await evaluate(request.conditions, request.mode, request.timeoutMs, {
      source: "transition_comparison",
      nodeId: attempt.nodeId,
      attemptId: attempt.attemptId,
      ...(stateRef ? { stateRef } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    });
    return effectCheckVerdict(verdict, request.conditions.length, request.mode);
  };
}

/** The host's verdict read by its count contract: judged conditions are the count, and `passed` speaks only of them. */
function effectCheckVerdict(verdict: AutomationNodeExpectationEvaluation, total: number, mode: string): AutomationStudioEffectCheckResult {
  const judged = verdict.checkedConditionCount;
  if (judged === undefined || judged === 0) return "unknown";
  if (mode === "any") {
    if (verdict.passed) return "landed";
    return judged >= total ? "not_landed" : "unknown";
  }
  if (!verdict.passed) return "not_landed";
  return judged >= total ? "landed" : "unknown";
}

/** Whether the ladder may skip this node: its own comparison says the state it was to produce holds. */
export function automationStudioExpectationSatisfiedAfterFailure(comparison: AutomationStudioTransitionComparison | undefined): boolean {
  return comparison?.metadata?.expectationSatisfiedAfterFailure === true;
}

/** How often an expected state's page facts are read again while the run waits for them to hold. */
const EXPECTED_FACTS_POLL_MS = 500;

/** What one wait for an expected state's facts came to: their joint truth, and how many facts the host settled. */
type ExpectedFactsRead = { truth: AutomationStudioFactTruth; settled: number };

/**
 * The page facts an expected state holds (t413), or none when it is the host's
 * expectation conditions. A facts list that does not parse is `[]`: it is
 * still facts, and a stored state Core cannot read proves nothing either way.
 */
function expectedFacts(expectedState: JsonObject): AutomationStudioFactCondition[] | undefined {
  const written = expectedState[AUTOMATION_STUDIO_EXPECTED_STATE_FACTS_KEY];
  if (written === undefined) return undefined;
  const parsed = parseAutomationStudioFactConditions(written, AUTOMATION_STUDIO_EXPECTED_STATE_FACTS_KEY);
  return parsed.problems.length ? [] : parsed.conditions;
}

/**
 * Asks the host's batched fact check about the facts, and again every
 * `EXPECTED_FACTS_POLL_MS` until all hold or `windowMs` has been waited. A
 * host that was not asked or failed (`calls` 0, a `problem`) answers no
 * better for waiting, so it is not asked again. No facts, or facts Core could
 * not read, are `unknown` without a question.
 */
async function readExpectedFacts(
  facts: readonly AutomationStudioFactCondition[],
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions,
  windowMs: number
): Promise<ExpectedFactsRead> {
  if (!facts.length) return { truth: "unknown", settled: 0 };
  const context = {
    inputs: options.invocation?.frame.inputs ?? options.inputs ?? {},
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    ...(options.signal ? { signal: options.signal } : {})
  };
  let waitedMs = 0;
  for (;;) {
    const observation = await observeAutomationStudioFacts({ hostRuntime: options.hostRuntime, groups: [{ key: "expected", conditions: facts }], context, ...(options.now ? { now: options.now } : {}) });
    const answers = observation.results.get("expected") ?? [];
    const read: ExpectedFactsRead = { truth: automationStudioFactConditionsHold(facts, answers), settled: answers.filter((answer) => answer.truth !== "unknown").length };
    const final = read.truth === "true" || observation.calls === 0 || observation.problem !== undefined || waitedMs >= windowMs || options.signal?.aborted === true;
    if (final) return read;
    const waitMs = Math.min(EXPECTED_FACTS_POLL_MS, windowMs - waitedMs);
    await automationStudioRunWait(options, waitMs);
    waitedMs += waitMs;
  }
}

/**
 * An attempt judged by its expected state's page facts (t413), the way
 * `attemptWithHostExpectationEvaluation` judges one by the host's evaluator:
 * a failed attempt is read once and keeps its status, with whether the facts
 * hold recorded beside it; a succeeded one is read until they hold or its wait
 * ceiling passes, and is rejected only by a `false` left at the end -- as a
 * failure found after acting, which never makes a lasting act again.
 */
async function attemptWithExpectedFacts(
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  facts: readonly AutomationStudioFactCondition[],
  options: AutomationStudioGraphExecutionOptions
): Promise<AutomationStudioNodeAttemptTrace> {
  if (attempt.status === "failed") {
    const read = await readExpectedFacts(facts, attempt, options, 0);
    return { ...attempt, transitionComparison: failedAttemptComparison(node, attempt, factsEvaluation(read)) };
  }
  const read = await readExpectedFacts(facts, attempt, options, automationStudioReadinessCeilingMs(automationStudioRecordedState(node).recordedGapMs));
  // Nothing settled says nothing about the page, so the attempt keeps the outcome its own execution gave it.
  if (read.truth === "unknown") return attempt;
  const evaluation = factsEvaluation(read);
  if (read.truth === "true") return { ...attempt, transitionComparison: compareAutomationStudioTransition(node, attempt, evaluation) };
  // Found after the act answered success: a verification failure, never an unknown outcome (`./defensive/effect-check.ts`).
  const failure: AutomationStudioFailureRecord = { ...AUTOMATION_STUDIO_EXPECTED_FACTS_FALSE_FAILURE };
  return {
    ...attempt,
    status: "failed",
    route: "failed",
    message: FACTS_REJECTED_MESSAGE,
    failure,
    transitionComparison: compareAutomationStudioTransition(node, attempt, { ...evaluation, failure })
  };
}

/** What an attempt rejected by its expected state's facts says. */
const FACTS_REJECTED_MESSAGE = "The page does not show what this step is meant to leave it showing.";

/** A facts read in the evaluation shape a comparison records: passed only when every fact held, and how many the host settled. */
function factsEvaluation(read: ExpectedFactsRead): AutomationNodeExpectationEvaluation {
  return { passed: read.truth === "true", checkedConditionCount: read.settled, ...(read.truth === "false" ? { message: FACTS_REJECTED_MESSAGE } : {}) };
}

// A failed attempt keeps the status its own outcome gave it; the host's verdict
// is recorded beside it so the ladder can read it. The comparison is rebuilt
// without the evaluation so the failure's own category still classifies it.
function failedAttemptComparison(
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  evaluation: AutomationNodeExpectationEvaluation
): AutomationStudioTransitionComparison {
  const comparison = compareAutomationStudioTransition(node, attempt);
  return {
    ...comparison,
    metadata: {
      ...(comparison.metadata ?? {}),
      expectationSatisfiedAfterFailure: evaluation.passed,
      expectationCheckedConditionCount: evaluation.checkedConditionCount ?? 0,
      ...(evaluation.message ? { expectationMessage: evaluation.message } : {})
    }
  };
}

function currentStateRef(attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  const refs: AutomationStudioHostStateSnapshotRef | undefined = attempt.stateRefs?.afterAction ?? attempt.stateRefs?.beforeAction;
  return refs?.stateRef;
}

function classifyTransitionComparisonStatus(input: {
  expected: AutomationStudioExpectedTransition;
  actual: AutomationStudioActualTransition;
  failure: AutomationStudioFailureRecord | undefined;
  missingOutputIds: string[];
  missingEffectTypes: string[];
  routeMatched: boolean;
  statusMatched: boolean;
  stateCheckCount: number;
  evaluation: AutomationNodeExpectationEvaluation | undefined;
}): AutomationStudioTransitionComparisonStatus {
  if (input.actual.status === "waiting") return input.expected.tolerance?.allowWaiting ? "tolerated" : "blocked";
  if (input.actual.status === "cancelled") return "blocked";
  if (input.actual.status === "failed") {
    // Structured first: the failure record names the category. Matching
    // "timeout" in the route or message serves only attempts without one.
    const structured = input.failure ? COMPARISON_STATUS_FOR_FAILURE[input.failure.category] : undefined;
    if (structured) return structured;
    const text = `${input.actual.route ?? ""} ${input.actual.message ?? ""}`.toLowerCase();
    return text.includes("timeout") || text.includes("timed out") ? "timeout" : "action_failed";
  }
  if (!input.statusMatched || !input.routeMatched) return "unexpected_state";
  // The host is the only authority on whether expected state holds. Reading the
  // attempt's own route for it is the fallback for an unevaluated expectation.
  if (input.evaluation) {
    if (!input.evaluation.passed) {
      return input.evaluation.failure ? COMPARISON_STATUS_FOR_FAILURE[input.evaluation.failure.category] : "missing_expected_state";
    }
  } else if (input.stateCheckCount > 0 && (input.actual.route === "failed" || input.actual.outputs.failed === true)) {
    return "missing_expected_state";
  }
  if (input.missingOutputIds.length || input.missingEffectTypes.length) return "missing_expected_state";
  if (input.actual.status !== "succeeded") return "unknown";
  return "matched";
}

function comparisonMessage(status: AutomationStudioTransitionComparisonStatus, expected: AutomationStudioExpectedTransition, actual: AutomationStudioActualTransition, missingOutputIds: string[], missingEffectTypes: string[]): string | undefined {
  if (status === "matched") return undefined;
  if (status === "tolerated") return "The transition did not finish, but waiting is tolerated for this node.";
  if (status === "blocked") return actual.message ?? "The transition is blocked or waiting without a tolerated wait policy.";
  if (status === "timeout") return actual.message ?? "The transition timed out.";
  if (status === "action_failed") return actual.message ?? "The node action failed.";
  if (status === "target_not_found") return actual.message ?? "No candidate matched the action target.";
  if (status === "target_ambiguous") return actual.message ?? "More than one candidate matched the action target.";
  if (status === "unexpected_state") return `Expected route/status did not match actual route/status (${expected.expectedRoute ?? "any"} -> ${actual.route ?? "none"}).`;
  if (status === "missing_expected_state") {
    const missing = [...missingOutputIds, ...missingEffectTypes.map((type) => `effect:${type}`)];
    return missing.length ? `Missing expected transition evidence: ${missing.join(", ")}.` : "Expected state was not confirmed.";
  }
  if (status === "ambiguous") return "The transition result is ambiguous.";
  return "The transition result is unknown.";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}
