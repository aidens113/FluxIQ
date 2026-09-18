// Turning later runs into confidence a repair has actually earned.
//
// A trial proves a change once, on the run that made it: one observation, on
// one page, at one moment. On a flaky page a single success is indistinguishable
// from luck, so a trial buys `provisional` and nothing more. What earns trust is
// the change going on working -- a REPLAY: a later ordinary run that executed
// the applied change and is judged by the same verdict rule the trial was.
//
// The tier rule itself lives in `flow-change/confidence.ts` and is not repeated
// here. This module's whole job is to produce the replay results that rule
// counts, and it is the only thing that produces them. Until it existed nothing
// in Core ever wrote a `replay`, so `established` was unreachable: every repair
// stayed `provisional` for ever however many times it went on working, and the
// promotion rule sat there with nothing to feed it.
//
// Everything here fails closed, because absence of evidence is never confidence:
//
// - A run that already recorded a result for a change says nothing further
//   about it. The run that trialled a repair is therefore not also a replay of
//   it, so one run can never supply both observations `established` needs.
// - Only an `applied` change can be replayed. A node carries an adaptation id
//   only once `applyApprovedAdaptation` stamped it, so a stamp naming a change
//   in any other status is stale metadata and not evidence that it ran.
// - An ordinary run's trace does not carry the host's per-condition judgement
//   of a declared expected state, only how many checks were counted, so a
//   replay reports that evidence as `unknown` -- which is never a pass.
// - A verdict that proves nothing records nothing. `unverifiable` and
//   `not_executed` leave the change exactly where it stood, neither promoted
//   nor demoted.
//
// A replay that is contradicted is recorded as a failure, which is the point of
// keeping the evidence rather than a score: the confidence rule drops the
// change back to `unverified` on it, so a repair that has stopped working stops
// being trusted on the next run rather than on the next person to look.
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../executor/index.ts";
import {
  automationStudioAttemptCapturedRecords,
  automationStudioAttemptVerifiesState,
  automationStudioChangeValidationResult,
  decideAutomationStudioChangeConfidence,
  decideAutomationStudioChangeVerdict,
  type AutomationStudioChangeConfidence,
  type AutomationStudioChangeConfidenceDecision,
  type AutomationStudioChangeVerdict,
  type AutomationStudioChangeVerdictAttempt
} from "../flow-change/index.ts";

/** The only status whose nodes carry a stamp, so the only one a run can replay. */
const REPLAYABLE_STATUS: AutomationStudioFlowAdaptation["status"] = "applied";

/** The tiers in order, so a promotion and a demotion are told apart by rank rather than by name. */
const TIER_RANK: Record<AutomationStudioChangeConfidence, number> = { unverified: 0, provisional: 1, established: 2 };

/** A saved change a run may have replayed, as this module reads one. */
export type AutomationStudioAdaptationReplaySubject = Pick<AutomationStudioFlowAdaptation, "adaptationId" | "riskLevel" | "status"> & {
  validationResults?: readonly AutomationStudioFlowAdaptationValidationResult[];
};

export type AutomationStudioAdaptationReplayInput = {
  /** The run being read as a replay. Its own id is what stops it counting twice. */
  runId: string;
  checkedAt: number;
  /** The finished run's trace. Its attempts carry the adaptation ids their nodes were stamped with. */
  trace: Pick<AutomationStudioGraphExecutionTrace, "attempts" | "status" | "currentNodeId">;
  /** The saved changes to judge. One outcome comes back per entry, in the order given. */
  adaptations: readonly AutomationStudioAdaptationReplaySubject[];
  /** The Subflow whose graph the run executed, when it ran inside one. */
  subflowId?: string;
  /**
   * Whether an attempt's node is a verification step, asked beside the node
   * definition's own `metadata.verifiesState` for definitions Core cannot see
   * into, such as a policy action dispatching a domain's assertion.
   */
  verifiesState?: (attempt: AutomationStudioNodeAttemptTrace) => boolean;
};

/** Why a run recorded nothing for a change. Codes only; each is a fact about the run, never a judgement of the change. */
export type AutomationStudioAdaptationReplaySkipCode =
  /** The change is not `applied`, so a node naming it is stale metadata. */
  | "not_applied"
  /** No attempt in the run carried the change's id: it did not run. */
  | "not_exercised"
  /** This run already recorded a result for the change, so it says nothing further. */
  | "run_already_counted"
  /** The run reached the change and neither proved nor contradicted it. */
  | "proved_nothing";

export type AutomationStudioAdaptationReplayOutcome = {
  adaptationId: string;
  /** The tier the change held before this run, and the one it holds after it. Equal whenever nothing was recorded. */
  before: AutomationStudioChangeConfidenceDecision;
  after: AutomationStudioChangeConfidenceDecision;
  /** The result to append, present exactly when the run proved or contradicted the change. */
  result?: AutomationStudioFlowAdaptationValidationResult;
  /** What the run made of the change, present whenever it reached it. */
  verdict?: AutomationStudioChangeVerdict;
  /** Present exactly when `result` is absent. */
  skippedCode?: AutomationStudioAdaptationReplaySkipCode;
  /** True only on a rise in tier, which is what a second succeeded replay buys. */
  promoted: boolean;
  /** True on any fall in tier: a contradicted replay drops the change back to `unverified`. */
  demoted: boolean;
};

/**
 * What one finished run says about each saved change it was asked about. Pure:
 * nothing is written, and a caller appends `result` with
 * `withAutomationStudioAdaptationReplay` once it has decided to.
 */
export function recordAutomationStudioAdaptationReplays(input: AutomationStudioAdaptationReplayInput): AutomationStudioAdaptationReplayOutcome[] {
  return input.adaptations.map((adaptation) => replayOutcome(adaptation, input));
}

/**
 * The adaptation with one replay result appended. A result whose run already
 * appears among the saved results is dropped rather than added, so appending
 * twice cannot manufacture the second observation `established` needs. The
 * adaptation is returned unchanged when nothing was appended.
 */
export function withAutomationStudioAdaptationReplay(
  adaptation: AutomationStudioFlowAdaptation,
  result: AutomationStudioFlowAdaptationValidationResult
): AutomationStudioFlowAdaptation {
  const saved = adaptation.validationResults ?? [];
  if (saved.some((existing) => existing.runId === result.runId)) return adaptation;
  return { ...adaptation, validationResults: [...saved, result] };
}

function replayOutcome(
  adaptation: AutomationStudioAdaptationReplaySubject,
  input: AutomationStudioAdaptationReplayInput
): AutomationStudioAdaptationReplayOutcome {
  const saved = adaptation.validationResults ?? [];
  const before = decideAutomationStudioChangeConfidence({ validationResults: saved, riskLevel: adaptation.riskLevel });
  const unchanged = (skippedCode: AutomationStudioAdaptationReplaySkipCode, verdict?: AutomationStudioChangeVerdict): AutomationStudioAdaptationReplayOutcome =>
    ({ adaptationId: adaptation.adaptationId, before, after: before, skippedCode, promoted: false, demoted: false, ...(verdict ? { verdict } : {}) });

  if (adaptation.status !== REPLAYABLE_STATUS) return unchanged("not_applied");
  if (saved.some((existing) => existing.runId === input.runId)) return unchanged("run_already_counted");
  const changedNodeIds = exercisedNodeIds(input.trace.attempts, adaptation.adaptationId);
  if (!changedNodeIds.length) return unchanged("not_exercised");

  const verdict = decideAutomationStudioChangeVerdict({
    changedNodeIds,
    attempts: input.trace.attempts.map((attempt) => replayAttempt(attempt, input)),
    runStatus: input.trace.status,
    ...(input.trace.currentNodeId !== undefined ? { endNodeId: input.trace.currentNodeId } : {}),
    ...(input.subflowId !== undefined ? { subflowId: input.subflowId } : {})
  });
  const result = automationStudioChangeValidationResult({ verdict, runId: input.runId, checkedAt: input.checkedAt, kind: "replay" });
  if (!result) return unchanged("proved_nothing", verdict);

  const after = decideAutomationStudioChangeConfidence({ validationResults: [...saved, result], riskLevel: adaptation.riskLevel });
  return {
    adaptationId: adaptation.adaptationId,
    before,
    after,
    result,
    verdict,
    promoted: TIER_RANK[after.tier] > TIER_RANK[before.tier],
    demoted: TIER_RANK[after.tier] < TIER_RANK[before.tier]
  };
}

/**
 * The nodes this run executed that carry the change's id, in the order they
 * first ran. The stamp is the only source: a node the run reached without one
 * is not part of the change, whatever else it did.
 */
function exercisedNodeIds(attempts: readonly AutomationStudioNodeAttemptTrace[], adaptationId: string): string[] {
  const nodeIds: string[] = [];
  for (const attempt of attempts) {
    if (attempt.adaptationIds?.includes(adaptationId) && !nodeIds.includes(attempt.nodeId)) nodeIds.push(attempt.nodeId);
  }
  return nodeIds;
}

/**
 * One executed attempt, as the verdict reads it on a replay.
 *
 * A declared expected state is reported `unknown` and never anything else. The
 * trial wraps the host's expectation evaluator to see each answer and whether
 * every condition was judged; a finished trace keeps no such record -- only
 * `diffSummary.stateCheckCount`, a count of checks, which says nothing about
 * what any of them decided. Reading a matched comparison as a pass would be
 * exactly the fail-open the trial was fixed for, so the replay declines to
 * guess and looks to the other evidence instead.
 *
 * A route is read as declared only on a success, because the executor fills a
 * failed attempt's expected route with `failed`.
 */
function replayAttempt(attempt: AutomationStudioNodeAttemptTrace, input: AutomationStudioAdaptationReplayInput): AutomationStudioChangeVerdictAttempt {
  const declared = attempt.transitionComparison?.expected;
  const succeeded = attempt.status === "succeeded";
  const expectedRoute = succeeded ? declared?.expectedRoute : undefined;
  const expectedOutputIds = Object.keys(declared?.expectedOutputs ?? {});
  const declaresState = Object.keys(declared?.expectedState ?? {}).length > 0;
  const records = automationStudioAttemptCapturedRecords(attempt);
  const verifiesState = automationStudioAttemptVerifiesState(attempt) || input.verifiesState?.(attempt) === true;
  return {
    nodeId: attempt.nodeId,
    status: attempt.status,
    ...(attempt.route !== undefined ? { route: attempt.route } : {}),
    outputIds: Object.keys(attempt.outputs).filter((outputId) => attempt.outputs[outputId] !== undefined),
    ...(expectedRoute !== undefined ? { expectedRoute } : {}),
    ...(expectedOutputIds.length ? { expectedOutputIds } : {}),
    ...(declaresState ? { expectedState: "unknown" as const } : {}),
    ...(records ? { records } : {}),
    ...(verifiesState ? { verifiesState } : {})
  };
}
