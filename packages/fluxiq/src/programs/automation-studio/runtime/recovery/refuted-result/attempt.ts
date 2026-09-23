// A run that executed cleanly and answered wrongly, as the failure entry point
// reads it.
//
// The recovery ladder is keyed on a *failed attempt*: Stage A classifies one,
// Stage B plans from that classification, and `plan.ts`'s `unclassifiedPlan`
// answers `stop` when there is none. A Flow whose every node succeeded and
// whose result does not answer the request has no failed attempt, so it reached
// the planner as "nothing to classify" and was stopped -- while Core's own
// result verification had already refuted it twice. Both runs of campaign
// `ten-sites-r5` ended that way: 38 provider calls, of which 34 were the build
// and 4 the verification, and **zero** were a repair
// (`fa-r5-postmortem.md`, cause 2).
//
// Nothing about the ladder is wrong; what was missing is the attempt. The
// verification already produces an `AutomationStudioFailureRecord` -- category
// `output_not_observed`, stage `verification`, with what was expected and what
// was observed -- and that record is exactly what the classifier reads. So this
// module does not add a second repair path. It builds the one attempt the
// existing path was waiting for, and hands it to the same Stage A the ladder
// already runs.
//
// **Which node it names.** The node the result came out of: the last attempt
// that stored records, or failing that the last attempt that succeeded. That is
// the node a repair edits or inserts steps ahead of, and it is the node whose
// page the failure evidence capture will read. A run with no attempts at all
// names nothing and produces no attempt, because a repair with no node to speak
// about would be a guess.
//
// **What it does not claim.** No route, no inputs, no outputs, no transition
// comparison. The run's steps did what they said; it is the answer that is
// wrong, and an attempt that invented a step failure would put a claim in the
// record that nothing observed.

import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import type { AutomationStudioResultVerificationOutcome } from "../../result-verification/index.ts";

/** The attempt id prefix, so a reader can tell this attempt from one the graph executed. */
export const AUTOMATION_STUDIO_REFUTED_RESULT_ATTEMPT_PREFIX = "result-verification";

/**
 * The failure entry point's two shapes of the same attempt: the live trace the
 * ladder classifies and patches from, and the run record the recovery context
 * and the request's recent actions are read out of.
 */
export type AutomationStudioRefutedResultAttempt = {
  trace: AutomationStudioNodeAttemptTrace;
  record: AutomationStudioFlowRunActionAttemptRecord;
};

export type AutomationStudioRefutedResultAttemptInput = {
  runId: string;
  /** The finished run, for the node its result came out of. */
  detail: AutomationStudioFlowRunDetail;
  /** The verification's own answer. Only a refutation produces an attempt. */
  outcome: AutomationStudioResultVerificationOutcome;
  now: number;
};

/**
 * The failed attempt a refuted result amounts to, or `undefined` when there is
 * none to build.
 *
 * `undefined` for three reasons, and they are different facts: the verification
 * never happened, so nothing was judged; it happened and did not refute the
 * result; or it refuted the result and the run recorded no step, so there is no
 * node to name. Each of them is a run this module has nothing to say about, and
 * none of them is "the result was right".
 *
 * `unsure` is deliberately not a refutation here. It is the verdict for a
 * result nobody could judge -- it still fails the run, and it still must never
 * read as a pass -- but a repair planned from it would be a change to a Flow on
 * evidence that nothing was wrong with it. Only `does_not_answer`, which is a
 * judgement that the answer is wrong, becomes an attempt.
 */
export function automationStudioRefutedResultAttempt(input: AutomationStudioRefutedResultAttemptInput): AutomationStudioRefutedResultAttempt | undefined {
  const outcome = input.outcome;
  if (outcome.performed !== true || outcome.verdict !== "does_not_answer") return undefined;
  // Parsed rather than trusted, as everywhere else a failure record is read:
  // the verdict reaches here through the same contract a domain's record does.
  const failure = parseAutomationStudioFailureRecord(outcome.failure);
  if (!failure || failure.stage !== "verification") return undefined;
  const source = resultProducingAttempt(input.detail);
  if (!source) return undefined;
  const startedAt = source.finishedAt ?? source.startedAt;
  const order = (input.detail.actionAttempts ?? []).reduce((highest, attempt) => Math.max(highest, attempt.order), 0) + 1;
  const attemptId = `${AUTOMATION_STUDIO_REFUTED_RESULT_ATTEMPT_PREFIX}.${input.runId}`;
  return {
    trace: {
      attemptId,
      nodeId: source.nodeId,
      definitionId: source.definitionId,
      startedAt,
      finishedAt: input.now,
      status: "failed",
      inputs: {},
      outputs: {},
      effects: [],
      message: outcome.reason,
      failure
    },
    record: {
      attemptId,
      nodeId: source.nodeId,
      definitionId: source.definitionId,
      order,
      status: "failed",
      startedAt,
      finishedAt: input.now,
      durationMs: Math.max(0, input.now - startedAt),
      message: outcome.reason,
      failure,
      // Verdict, basis and code: the same three words the run's own
      // `resultVerification` carries, so a reader of the attempt does not have
      // to go and find it. No observation and no reason text -- the record's
      // own `actual` already carries what was seen, under the contract's bound.
      metadata: { resultVerification: { verdict: outcome.verdict, basis: outcome.basis, code: outcome.code } }
    }
  };
}

/**
 * The node the result came out of.
 *
 * The last attempt that stored records is preferred, because that is the step
 * whose output the verification judged. Where no attempt recorded a count --
 * the domain did not report one, or the result was assembled some other way --
 * the last step that succeeded stands in, because a repair speaks about the end
 * of the Flow either way. A run whose every attempt failed is not this module's
 * case at all: it already has a failed attempt and the ladder already ran.
 */
function resultProducingAttempt(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunActionAttemptRecord | undefined {
  const attempts = [...(detail.actionAttempts ?? [])].reverse();
  const stored = attempts.find((attempt) => attempt.status === "succeeded" && typeof attempt.metadata?.recordCount === "number");
  return stored ?? attempts.find((attempt) => attempt.status === "succeeded");
}
